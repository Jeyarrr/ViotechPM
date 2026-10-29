import type { Prisma, ProjectTransaction } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { isAdmin } from './project.service.js';
import { conflict, notFound } from './core.service.js';
import { AppError } from '../utils/errors.js';

export const transactionInclude = {
  project: { select: { id: true, code: true, name: true, managerId: true, archivedAt: true } },
  type: true,
  requester: { select: { id: true, name: true, email: true } },
  department: { select: { id: true, name: true } },
  expense: {
    select: {
      id: true,
      amount: true,
      expenseDate: true,
      category: true,
      kind: true,
      recordedBy: { select: { id: true, name: true } },
      reversedBy: { select: { id: true, amount: true, expenseDate: true, reversalReason: true } },
    },
  },
} as const;
export const workflowInclude = {
  steps: {
    orderBy: { sequence: 'asc' as const },
    include: {
      assignedApprover: {
        select: { id: true, name: true, status: true, role: { select: { key: true, name: true } } },
      },
      decision: { include: { approver: { select: { id: true, name: true } } } },
    },
  },
} as const;
export function transactionScope(user: PublicUser): Prisma.ProjectTransactionWhereInput {
  return isAdmin(user)
    ? {}
    : {
        OR: [
          { requesterId: user.id },
          ...(user.role.key === 'project_manager' ? [{ project: { managerId: user.id } }] : []),
        ],
      };
}
export function transactionWhere(
  q: {
    q: string;
    projectId?: string;
    typeId?: string;
    requesterId?: string;
    departmentId?: string;
    status?: ProjectTransaction['status'];
    dateFrom?: Date;
    dateTo?: Date;
  },
  user: PublicUser,
): Prisma.ProjectTransactionWhereInput {
  return {
    AND: [
      transactionScope(user),
      {
        projectId: q.projectId,
        typeId: q.typeId,
        requesterId: q.requesterId,
        departmentId: q.departmentId,
        status: q.status,
        transactionDate: { gte: q.dateFrom, lte: q.dateTo },
        OR: [
          { reference: { contains: q.q, mode: 'insensitive' } },
          { title: { contains: q.q, mode: 'insensitive' } },
        ],
      },
    ],
  };
}
export function transactionPermissions(
  item: {
    requesterId: string;
    status: string;
    project: { archivedAt: Date | null; managerId: string };
    expense?: { reversedBy: unknown | null } | null;
  },
  user: PublicUser,
) {
  const editable =
    item.requesterId === user.id &&
    ['DRAFT', 'RETURNED_FOR_REVISION'].includes(item.status) &&
    !item.project.archivedAt;
  return {
    canEdit: editable,
    canSubmit: editable,
    canPostExpense:
      !item.expense &&
      item.status === 'APPROVED' &&
      !item.project.archivedAt &&
      (isAdmin(user) ||
        (user.role.key === 'project_manager' && item.project.managerId === user.id)),
    canCancel: isAdmin(user)
      ? !['REJECTED', 'CANCELLED'].includes(item.status) &&
        (!item.expense || !!item.expense.reversedBy)
      : item.requesterId === user.id &&
        ['DRAFT', 'RETURNED_FOR_REVISION', 'SUBMITTED', 'UNDER_REVIEW'].includes(item.status),
  };
}
export async function accessibleTransaction(
  tx: Prisma.TransactionClient,
  id: string,
  user: PublicUser,
  lock = false,
) {
  let item =
    (await tx.projectTransaction.findFirst({
      where: { id, ...transactionScope(user) },
      include: transactionInclude,
    })) ?? notFound();
  if (lock) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${item.projectId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM project_transactions WHERE id = ${id}::uuid FOR UPDATE`;
    item =
      (await tx.projectTransaction.findFirst({
        where: { id, ...transactionScope(user) },
        include: transactionInclude,
      })) ?? notFound();
  }
  return item;
}
export async function validateTransactionType(
  tx: Prisma.TransactionClient,
  typeId: string,
  beforeType?: string,
) {
  if (typeId === beforeType) return;
  await tx.$queryRaw`SELECT id FROM transaction_types WHERE id = ${typeId}::uuid FOR SHARE`;
  if (!(await tx.transactionType.findFirst({ where: { id: typeId, active: true } })))
    conflict('Choose an active transaction type.');
}
export async function eligibleReviewer(
  tx: Prisma.TransactionClient,
  id: string,
  projectManagerId: string,
  sequence: number,
) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR SHARE`;
  const user = await tx.user.findFirst({
    where: { id, status: 'ACTIVE' },
    include: { role: true },
  });
  return user &&
    (user.role.key === 'super_admin' ||
      (sequence === 1 && user.role.key === 'project_manager' && id === projectManagerId))
    ? user
    : null;
}
export async function resolveReviewers(
  tx: Prisma.TransactionClient,
  project: { id: string; managerId: string },
  requesterId: string,
) {
  const policy = await tx.approvalPolicy.findUnique({ where: { projectId: project.id } });
  const requireSecondReview = policy?.requireSecondReview ?? true;
  const admins = await tx.user.findMany({
    where: { status: 'ACTIVE', role: { key: 'super_admin' }, id: { not: requesterId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  let primaryId = policy?.primaryReviewerId ?? project.managerId;
  if (!policy?.primaryReviewerId && primaryId === requesterId)
    primaryId = admins.find((a) => a.id !== policy?.finalReviewerId)?.id ?? '';
  if (
    !primaryId ||
    primaryId === requesterId ||
    !(await eligibleReviewer(tx, primaryId, project.managerId, 1))
  )
    conflict(
      'An independent active project reviewer is required. Ask a Super Admin to configure the project approval policy.',
    );
  const reviewers = [primaryId];
  if (requireSecondReview) {
    const finalId = policy?.finalReviewerId ?? admins.find((a) => a.id !== primaryId)?.id;
    if (
      !finalId ||
      finalId === requesterId ||
      finalId === primaryId ||
      !(await eligibleReviewer(tx, finalId, project.managerId, 2))
    )
      conflict(
        'A distinct active Super Admin is required for final review. Configure reviewers or create an additional authorized reviewer account.',
      );
    reviewers.push(finalId);
  }
  return reviewers;
}
export function assertRequester(item: { requesterId: string }, user: PublicUser) {
  if (item.requesterId !== user.id)
    throw new AppError(
      403,
      'FORBIDDEN',
      'Only the requesting employee may edit or submit this request.',
    );
}
