import type { Prisma, AuditLog } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { projectScope } from './project.service.js';
import { taskScope } from './task.service.js';
import { transactionScope } from './transaction.service.js';

export function notificationScope(user: PublicUser): Prisma.NotificationWhereInput {
  return {
    recipientId: user.id,
    AND: [
      {
        OR: [
          { transactionId: { not: null }, transaction: transactionScope(user) },
          { transactionId: null, taskId: { not: null }, task: taskScope(user) },
          { transactionId: null, taskId: null, project: projectScope(user) },
        ],
      },
    ],
  };
}

export async function notifyAudit(tx: Prisma.TransactionClient, event: AuditLog) {
  if (!event.entityId || !event.projectId) return;
  if (
    event.action === 'task.status_changed' &&
    (event.metadata as Record<string, unknown> | null)?.after === 'COMPLETED'
  )
    return;
  const project = await tx.project.findUnique({
    where: { id: event.projectId },
    include: { members: true },
  });
  if (!project || project.archivedAt) return;
  const candidates = new Set<string>();
  const meta = (event.metadata ?? {}) as Record<string, unknown>;
  let taskId: string | null = null;
  let transactionId: string | null = null;
  let title = '';
  let label = project.name;
  if (event.action === 'project.member_assigned' && typeof meta.userId === 'string') {
    candidates.add(meta.userId);
    title = 'Project assignment';
  } else if (
    event.entityType === 'Task' &&
    ['task.created', 'task.reassigned', 'task.status_changed', 'task.completed'].includes(
      event.action,
    )
  ) {
    const task = await tx.task.findUnique({ where: { id: event.entityId } });
    if (!task || task.archivedAt) return;
    taskId = task.id;
    label = task.title;
    if (task.assigneeId) candidates.add(task.assigneeId);
    candidates.add(project.managerId);
    title =
      event.action === 'task.completed'
        ? 'Task completed'
        : event.action.includes('status')
          ? 'Task status updated'
          : 'Task assignment';
  } else if (
    event.entityType === 'Milestone' &&
    ['milestone.created', 'milestone.updated', 'milestone.completed'].includes(event.action)
  ) {
    const item = await tx.milestone.findUnique({ where: { id: event.entityId } });
    if (!item || item.archivedAt) return;
    if (item.responsibleId) candidates.add(item.responsibleId);
    candidates.add(project.managerId);
    label = item.title;
    title = event.action === 'milestone.completed' ? 'Milestone completed' : 'Milestone updated';
  } else if (
    event.entityType === 'ProjectTransaction' &&
    ['transaction.submitted', 'transaction.status_changed', 'approval.reassigned'].includes(
      event.action,
    )
  ) {
    const item = await tx.projectTransaction.findUnique({
      where: { id: event.entityId },
      include: {
        workflows: {
          where: { status: 'ACTIVE' },
          include: { steps: { where: { state: 'PENDING' } } },
        },
      },
    });
    if (!item) return;
    transactionId = item.id;
    label = item.title;
    candidates.add(item.requesterId);
    for (const workflow of item.workflows)
      for (const step of workflow.steps) candidates.add(step.assignedApproverId);
    title = `Request ${item.status.toLowerCase().replaceAll('_', ' ')}`;
  }
  if (!title) return;
  const users = await tx.user.findMany({
    where: { id: { in: [...candidates] }, status: 'ACTIVE' },
    include: { role: true },
  });
  const members = new Set(project.members.map((m) => m.userId));
  await tx.notification.createMany({
    data: users
      .filter((u) => {
        if (u.id === event.actorId) return false;
        if (transactionId) return true; // Only requester and explicitly assigned reviewers above.
        return u.role.key === 'super_admin' || u.id === project.managerId || members.has(u.id);
      })
      .map((u) => ({
        recipientId: u.id,
        projectId: project.id,
        taskId,
        transactionId,
        type: event.action,
        title,
        message: label.slice(0, 500),
        entityType: event.entityType,
        entityId: event.entityId!,
        dedupeKey: `audit:${event.id}`,
      })),
    skipDuplicates: true,
  });
}

export function notificationLink(item: {
  taskId: string | null;
  transactionId: string | null;
  projectId: string | null;
  entityType: string;
  entityId: string;
}) {
  if (item.transactionId) return `/transactions/${item.transactionId}`;
  if (item.taskId) return `/tasks/${item.taskId}`;
  if (item.entityType === 'Milestone') return `/milestones/${item.entityId}`;
  return `/projects/${item.projectId}`;
}
