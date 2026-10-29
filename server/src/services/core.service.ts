import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';
import { notifyAudit } from './notification.service.js';

export function notFound(): never {
  throw new AppError(404, 'NOT_FOUND', 'This record is unavailable or you do not have access.');
}
export function conflict(message: string): never {
  throw new AppError(409, 'CONFLICT', message);
}
export function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
export async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  changes: object = {},
) {
  let projectId: string | null = null;
  if (entityType === 'Project')
    projectId =
      (await tx.project.findUnique({ where: { id: entityId }, select: { id: true } }))?.id ?? null;
  else if (entityType === 'Task')
    projectId =
      (await tx.task.findUnique({ where: { id: entityId }, select: { projectId: true } }))
        ?.projectId ?? null;
  else if (entityType === 'Milestone')
    projectId =
      (await tx.milestone.findUnique({ where: { id: entityId }, select: { projectId: true } }))
        ?.projectId ?? null;
  else if (entityType === 'ProjectTransaction')
    projectId =
      (
        await tx.projectTransaction.findUnique({
          where: { id: entityId },
          select: { projectId: true },
        })
      )?.projectId ?? null;
  else if (entityType === 'Expense')
    projectId =
      (await tx.expense.findUnique({ where: { id: entityId }, select: { projectId: true } }))
        ?.projectId ?? null;
  const event = await tx.auditLog.create({
    data: {
      projectId,
      actorId,
      action,
      entityType,
      entityId,
      metadata: redactAuditMetadata(JSON.parse(JSON.stringify(changes))) as Prisma.InputJsonValue,
    },
  });
  await notifyAudit(tx, event);
}
export function redactAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditMetadata);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /password|secret|token|credential|authorization|cookie/i.test(key)
          ? '[REDACTED]'
          : redactAuditMetadata(item),
      ]),
    );
  return value;
}
export function changedFields(before: object, after: object, fields: string[]) {
  const a = before as Record<string, unknown>,
    b = after as Record<string, unknown>;
  return Object.fromEntries(
    fields
      .filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
      .map((key) => [key, { before: a[key] ?? null, after: b[key] ?? null }]),
  );
}
