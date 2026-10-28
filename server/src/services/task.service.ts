import type { Prisma, Project } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { isAdmin, projectScope } from './project.service.js';
import { audit, conflict } from './core.service.js';
import { AppError } from '../utils/errors.js';
export const today = () =>
  new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}T00:00:00.000Z`,
  );
export const taskInclude = {
  project: { select: { id: true, code: true, name: true, managerId: true, archivedAt: true } },
  assignee: { select: { id: true, name: true, profileImage: true } },
} as const;
export function taskScope(user: PublicUser): Prisma.TaskWhereInput {
  return {
    project: projectScope(user),
    ...(user.role.key === 'employee' ? { assigneeId: user.id } : {}),
  };
}
export const canManageProject = (user: PublicUser, project: { managerId: string }) =>
  isAdmin(user) || (user.role.key === 'project_manager' && project.managerId === user.id);
export async function validateTask(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    assigneeId?: string | null;
    startDate: Date;
    dueDate: Date;
    status: string;
  },
  checkAssignee = true,
) {
  if (input.dueDate < input.startDate)
    throw new AppError(422, 'INVALID_DATES', 'Due date must be on or after the start date.');
  if (input.assigneeId && checkAssignee) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.assigneeId}::uuid FOR SHARE`;
    if (
      !(await tx.projectMember.findFirst({
        where: { projectId: input.projectId, userId: input.assigneeId, user: { status: 'ACTIVE' } },
      }))
    )
      conflict('Assign an active member of this project, or leave the task unassigned.');
  }
}
export async function reconcileCompletion(
  tx: Prisma.TransactionClient,
  project: Project,
  actorId: string,
) {
  if (project.status !== 'COMPLETED') return;
  const total = await tx.task.count({ where: { projectId: project.id, archivedAt: null } });
  const unfinished = await tx.task.count({
    where: { projectId: project.id, archivedAt: null, status: { not: 'COMPLETED' } },
  });
  if (!total || unfinished) {
    await tx.project.update({
      where: { id: project.id },
      data: { status: 'ACTIVE', actualCompletionDate: null },
    });
    await audit(tx, actorId, 'project.status_changed', 'Project', project.id, {
      before: 'COMPLETED',
      after: 'ACTIVE',
      reason: 'Task work changed',
    });
  }
}
