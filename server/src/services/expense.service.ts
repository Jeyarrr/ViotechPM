import { Prisma, type Project } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { conflict, pageResult } from './core.service.js';
import { isAdmin } from './project.service.js';
import { AppError } from '../utils/errors.js';

const Money = Prisma.Decimal.clone({ precision: 40 });
export const money = (value: Prisma.Decimal | string | number | null | undefined) =>
  new Money(value?.toString() ?? '0');
export const financialProjectScope = (user: PublicUser): Prisma.ProjectWhereInput =>
  isAdmin(user)
    ? {}
    : user.role.key === 'project_manager'
      ? { managerId: user.id }
      : { id: { in: [] } };
export function financialProjectWhere(
  q: { projectId?: string; clientId?: string; projectState?: string },
  user: PublicUser,
): Prisma.ProjectWhereInput {
  return {
    AND: [
      financialProjectScope(user),
      {
        id: q.projectId,
        clientId: q.clientId,
        ...(q.projectState === 'current'
          ? { archivedAt: null }
          : q.projectState === 'archived'
            ? { archivedAt: { not: null } }
            : {}),
      },
    ],
  };
}
export function expenseWhere(
  q: {
    q: string;
    projectId?: string;
    clientId?: string;
    projectState?: string;
    category?: string;
    dateFrom?: Date;
    dateTo?: Date;
  },
  user: PublicUser,
): Prisma.ExpenseWhereInput {
  return {
    project: financialProjectWhere(q, user),
    category: q.category,
    expenseDate: { gte: q.dateFrom, lte: q.dateTo },
    OR: [
      { description: { contains: q.q, mode: 'insensitive' } },
      { category: { contains: q.q, mode: 'insensitive' } },
      { transaction: { reference: { contains: q.q, mode: 'insensitive' } } },
      { reversalOf: { transaction: { reference: { contains: q.q, mode: 'insensitive' } } } },
    ],
  };
}
export const expenseInclude = {
  project: {
    select: {
      id: true,
      code: true,
      name: true,
      managerId: true,
      archivedAt: true,
      client: { select: { id: true, name: true } },
    },
  },
  transaction: { select: { id: true, reference: true, title: true } },
  recordedBy: { select: { id: true, name: true } },
  reversalOf: {
    select: { id: true, amount: true, transaction: { select: { id: true, reference: true } } },
  },
  reversedBy: { select: { id: true, amount: true, expenseDate: true, reversalReason: true } },
} as const;
export async function assertFinancialActor(
  tx: Prisma.TransactionClient,
  userId: string,
  managerId: string,
  adminOnly = false,
) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR SHARE`;
  const actor = await tx.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (
    !actor ||
    actor.status !== 'ACTIVE' ||
    !(
      actor.role.key === 'super_admin' ||
      (!adminOnly && actor.role.key === 'project_manager' && actor.id === managerId)
    )
  )
    throw new AppError(
      403,
      'FORBIDDEN',
      adminOnly
        ? 'An active Super Admin is required for reversals.'
        : 'Only active project management may post expenses.',
    );
}
export async function projectSpending(tx: Prisma.TransactionClient, projectId: string) {
  return money(
    (await tx.expense.aggregate({ where: { projectId }, _sum: { amount: true } }))._sum.amount,
  );
}
export function calculatedBudget(budget: Prisma.Decimal | string | null, expenses: Prisma.Decimal) {
  const allocated = budget === null ? null : money(budget),
    spent = money(expenses);
  return {
    budget: allocated?.toFixed(2) ?? null,
    totalExpenses: spent.toFixed(2),
    remainingBudget: allocated ? allocated.minus(spent).toFixed(2) : null,
    utilization: allocated?.greaterThan(0)
      ? spent.dividedBy(allocated).times(100).toFixed(2)
      : null,
  };
}
export async function projectBudgetSummary(
  tx: Prisma.TransactionClient,
  project: Pick<Project, 'id' | 'budget'>,
) {
  return {
    projectId: project.id,
    currency: 'PHP',
    ...calculatedBudget(project.budget, await projectSpending(tx, project.id)),
  };
}
export async function validateBudgetChange(
  tx: Prisma.TransactionClient,
  projectId: string,
  budget: string | null,
) {
  const spending = await projectSpending(tx, projectId);
  if (spending.greaterThan(0) && (budget === null || money(budget).lessThan(spending)))
    conflict('The project budget cannot be unset or reduced below its net posted expenses.');
}
export async function expenseSummary(
  tx: Prisma.TransactionClient,
  q: {
    q: string;
    projectId?: string;
    clientId?: string;
    projectState?: string;
    category?: string;
    dateFrom?: Date;
    dateTo?: Date;
    projectPage: number;
  },
  user: PublicUser,
) {
  const projectsWhere = financialProjectWhere(q, user),
    where = expenseWhere(q, user);
  const allocation = await tx.project.aggregate({ where: projectsWhere, _sum: { budget: true } });
  const spending = money(
    (await tx.expense.aggregate({ where: { project: projectsWhere }, _sum: { amount: true } }))._sum
      .amount,
  );
  const filtered = money(
    (await tx.expense.aggregate({ where, _sum: { amount: true } }))._sum.amount,
  );
  const total = await tx.project.count({ where: projectsWhere });
  const items = await tx.project.findMany({
    where: projectsWhere,
    select: {
      id: true,
      name: true,
      code: true,
      budget: true,
      archivedAt: true,
      client: { select: { id: true, name: true } },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    skip: (q.projectPage - 1) * 10,
    take: 10,
  });
  const perProject = await tx.expense.groupBy({
    by: ['projectId'],
    where: { projectId: { in: items.map((p) => p.id) } },
    _sum: { amount: true },
  });
  const categories = await tx.expense.groupBy({
    by: ['category'],
    where,
    _sum: { amount: true },
    orderBy: { category: 'asc' },
  });
  return {
    currency: 'PHP',
    totals: calculatedBudget(allocation._sum.budget ?? '0', spending),
    filteredExpenses: filtered.toFixed(2),
    unbudgetedProjects: await tx.project.count({
      where: { AND: [projectsWhere, { OR: [{ budget: null }, { budget: 0 }] }] },
    }),
    projects: pageResult(
      items.map((p) => ({
        ...p,
        ...calculatedBudget(
          p.budget,
          money(perProject.find((e) => e.projectId === p.id)?._sum.amount),
        ),
      })),
      total,
      q.projectPage,
      10,
    ),
    categories: categories.map((row) => ({
      category: row.category,
      amount: money(row._sum.amount).toFixed(2),
    })),
  };
}
