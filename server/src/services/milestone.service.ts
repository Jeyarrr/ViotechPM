import type { Prisma, Project } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { projectScope } from './project.service.js';
import { audit, conflict, notFound } from './core.service.js';
import { canManageProject, today } from './task.service.js';
import { AppError } from '../utils/errors.js';
export const milestoneInclude = {
  project: { select: { id: true, code: true, name: true, managerId: true, archivedAt: true } },
  responsible: { select: { id: true, name: true, profileImage: true } },
  tasks: { where: { archivedAt: null }, select: { status: true } },
} as const;
export function milestoneScope(user: PublicUser): Prisma.MilestoneWhereInput {
  return { project: projectScope(user) };
}
type IncludedMilestone = Prisma.MilestoneGetPayload<{ include: typeof milestoneInclude }>;
export function milestonePayload(item: IncludedMilestone, user: PublicUser) {
  const { tasks, ...record } = item;
  const totalTasks = tasks.length,
    completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const manage = canManageProject(user, item.project);
  return {
    ...record,
    totalTasks,
    completedTasks,
    progress: totalTasks
      ? Math.round((completedTasks / totalTasks) * 100)
      : item.status === 'COMPLETED'
        ? 100
        : 0,
    overdue: item.status !== 'COMPLETED' && item.dueDate < today(),
    canManage: manage,
    canUpdateStatus:
      !item.archivedAt &&
      !item.project.archivedAt &&
      (manage ||
        (['developer', 'it_support'].includes(user.role.key) && item.responsibleId === user.id)),
  };
}
export async function validateMilestone(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    responsibleId?: string | null;
    startDate: Date;
    dueDate: Date;
    status: string;
  },
  before?: { id: string; responsibleId: string | null; status: string },
) {
  if (input.dueDate < input.startDate)
    throw new AppError(422, 'INVALID_DATES', 'Due date must be on or after the start date.');
  if (
    input.responsibleId &&
    (input.responsibleId !== before?.responsibleId || input.status !== 'COMPLETED')
  ) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.responsibleId}::uuid FOR SHARE`;
    if (
      !(await tx.projectMember.findFirst({
        where: {
          projectId: input.projectId,
          userId: input.responsibleId,
          user: { status: 'ACTIVE' },
        },
      }))
    )
      conflict('Choose an active project member as the responsible employee.');
  }
  if (
    input.status === 'COMPLETED' &&
    before &&
    (await tx.task.count({
      where: { milestoneId: before.id, archivedAt: null, status: { not: 'COMPLETED' } },
    }))
  )
    conflict('Complete all current linked tasks before completing this milestone.');
}
export async function validateMilestoneLink(
  tx: Prisma.TransactionClient,
  input: { projectId: string; milestoneId?: string | null },
  oldMilestoneId?: string | null,
) {
  if (!input.milestoneId || input.milestoneId === oldMilestoneId) return;
  const milestone = await tx.milestone.findFirst({
    where: { id: input.milestoneId, projectId: input.projectId, archivedAt: null },
  });
  if (!milestone) conflict('Choose a current milestone belonging to this task’s project.');
}
export async function reconcileMilestones(
  tx: Prisma.TransactionClient,
  ids: (string | null | undefined)[],
  actorId: string,
) {
  for (const id of new Set(ids.filter((id): id is string => !!id))) {
    const milestone = await tx.milestone.findUnique({ where: { id } });
    if (!milestone || milestone.archivedAt || milestone.status !== 'COMPLETED') continue;
    if (
      await tx.task.count({
        where: { milestoneId: id, archivedAt: null, status: { not: 'COMPLETED' } },
      })
    ) {
      await tx.milestone.update({
        where: { id },
        data: { status: 'IN_PROGRESS', completedAt: null },
      });
      await audit(tx, actorId, 'milestone.reopened', 'Milestone', id, {
        projectId: milestone.projectId,
        reason: 'Linked task work changed',
      });
    }
  }
}
export async function reconcileProjectMilestones(
  tx: Prisma.TransactionClient,
  project: Project,
  actorId: string,
) {
  if (
    project.status === 'COMPLETED' &&
    (await tx.milestone.count({
      where: { projectId: project.id, archivedAt: null, status: { not: 'COMPLETED' } },
    }))
  ) {
    await tx.project.update({
      where: { id: project.id },
      data: { status: 'ACTIVE', actualCompletionDate: null },
    });
    await audit(tx, actorId, 'project.status_changed', 'Project', project.id, {
      before: 'COMPLETED',
      after: 'ACTIVE',
      reason: 'Milestone work changed',
    });
  }
}
export async function accessibleMilestone(
  tx: Prisma.TransactionClient,
  id: string,
  user: PublicUser,
) {
  return (
    (await tx.milestone.findFirst({
      where: { id, ...milestoneScope(user) },
      include: milestoneInclude,
    })) ?? notFound()
  );
}
