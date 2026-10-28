import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';

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
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      metadata: JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue,
    },
  });
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
