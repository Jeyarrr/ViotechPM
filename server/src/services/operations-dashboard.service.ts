import type { Prisma } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { projectScope } from './project.service.js';
import { transactionScope } from './transaction.service.js';
import { today } from './task.service.js';
import { expenseSummary } from './expense.service.js';

export async function operationsDashboard(tx: Prisma.TransactionClient, user: PublicUser) {
  const day = today(),
    horizon = new Date(day.getTime() + 30 * 86400000);
  const milestoneWhere: Prisma.MilestoneWhereInput = {
    archivedAt: null,
    project: { ...projectScope(user), archivedAt: null },
  };
  const upcomingWhere = {
    ...milestoneWhere,
    status: { not: 'COMPLETED' as const },
    dueDate: { gte: day, lt: horizon },
  };
  const select = {
    id: true,
    title: true,
    dueDate: true,
    status: true,
    project: { select: { id: true, name: true } },
    responsible: { select: { name: true } },
  } as const;
  const upcoming = await tx.milestone.findMany({
    where: upcomingWhere,
    select,
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take: 6,
  });
  const overdue = await tx.milestone.findMany({
    where: { ...milestoneWhere, status: { not: 'COMPLETED' }, dueDate: { lt: day } },
    select,
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take: 6,
  });
  const upcomingCount = await tx.milestone.count({ where: upcomingWhere });
  const milestoneStatus = await tx.milestone.groupBy({
    by: ['status'],
    where: milestoneWhere,
    _count: true,
  });
  const transactionWhere: Prisma.ProjectTransactionWhereInput = {
    AND: [transactionScope(user), { project: { archivedAt: null } }],
  };
  const transactionSelect = {
    id: true,
    reference: true,
    title: true,
    status: true,
    requestedAmount: true,
    submittedAt: true,
    createdAt: true,
    project: { select: { id: true, name: true } },
    requester: { select: { name: true } },
  } as const;
  const recentTransactions = await tx.projectTransaction.findMany({
    where: transactionWhere,
    select: transactionSelect,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 6,
  });
  const pendingWhere: Prisma.ProjectTransactionWhereInput = {
    AND: [
      transactionWhere,
      {
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
        workflows: {
          some: {
            status: 'ACTIVE',
            steps: { some: { state: 'PENDING', assignedApproverId: user.id } },
          },
        },
      },
    ],
  };
  const pendingCount = user.permissions.includes('approvals:read')
    ? await tx.projectTransaction.count({ where: pendingWhere })
    : 0;
  const pendingApprovals = user.permissions.includes('approvals:read')
    ? await tx.projectTransaction.findMany({
        where: pendingWhere,
        select: transactionSelect,
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        take: 6,
      })
    : [];
  const financial = user.permissions.includes('expenses:read')
    ? await expenseSummary(tx, { q: '', projectState: 'current', projectPage: 1 }, user)
    : null;
  return {
    pendingCount,
    upcomingCount,
    milestoneStatus: ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'DELAYED'].map(
      (status) => ({
        status,
        count: milestoneStatus.find((m) => m.status === status)?._count ?? 0,
      }),
    ),
    upcoming,
    overdue,
    recentTransactions,
    pendingApprovals,
    financial,
  };
}
export type OperationsOverview = Awaited<ReturnType<typeof operationsDashboard>>;
