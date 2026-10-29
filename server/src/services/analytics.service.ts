import { z } from 'zod';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { projectScope } from './project.service.js';
import { taskScope, today } from './task.service.js';
import { calculatedBudget, money, financialProjectScope } from './expense.service.js';
import { projectStatusSchema, dateSchema } from '../validators/project.js';
import { taskStatusSchema } from '../validators/task.js';
import { pageResult } from './core.service.js';

export const analyticsFilters = z
  .object({
    projectId: z.uuid().optional(),
    status: projectStatusSchema.optional(),
    taskStatus: taskStatusSchema.optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, 'Invalid date range.');
export async function operationalAnalytics(
  db: PrismaClient,
  user: PublicUser,
  q: z.infer<typeof analyticsFilters>,
) {
  return db.$transaction(
    async (tx) => {
      const day = today(),
        soon = new Date(day.getTime() + 7 * 86400000);
      const scope: Prisma.ProjectWhereInput = {
        ...projectScope(user),
        archivedAt: null,
        id: q.projectId,
        status: q.status,
      };
      const dateRange = { gte: q.dateFrom, lte: q.dateTo };
      const projects = await tx.project.findMany({
        where: { ...scope, targetDate: dateRange },
        select: { id: true, name: true, status: true, targetDate: true },
        orderBy: [{ targetDate: 'asc' }, { id: 'asc' }],
      });
      const taskWhere: Prisma.TaskWhereInput = {
        ...taskScope(user),
        project: scope,
        archivedAt: null,
        status: q.taskStatus,
        dueDate: dateRange,
      };
      const milestoneWhere: Prisma.MilestoneWhereInput = {
        project: scope,
        archivedAt: null,
        dueDate: dateRange,
      };
      const taskStatus = await tx.task.groupBy({
        by: ['status'],
        where: taskWhere,
        _count: { _all: true },
      });
      const taskPriority = await tx.task.groupBy({
        by: ['priority'],
        where: taskWhere,
        _count: { _all: true },
      });
      const taskOverdue = await tx.task.count({
        where: { AND: [taskWhere, { status: { not: 'COMPLETED' }, dueDate: { lt: day } }] },
      });
      const milestoneStatus = await tx.milestone.groupBy({
        by: ['status'],
        where: milestoneWhere,
        _count: { _all: true },
      });
      const milestoneOverdue = await tx.milestone.count({
        where: { AND: [milestoneWhere, { status: { not: 'COMPLETED' }, dueDate: { lt: day } }] },
      });
      const milestoneUpcoming = await tx.milestone.count({
        where: {
          AND: [milestoneWhere, { status: { not: 'COMPLETED' }, dueDate: { gte: day, lte: soon } }],
        },
      });
      const grouped = await tx.task.groupBy({
        by: ['assigneeId', 'status'],
        where: taskWhere,
        _count: { _all: true },
      });
      const overdue = await tx.task.groupBy({
        by: ['assigneeId'],
        where: { AND: [taskWhere, { status: { not: 'COMPLETED' }, dueDate: { lt: day } }] },
        _count: { _all: true },
      });
      const employees = await tx.user.findMany({
        where: { id: { in: grouped.flatMap((g) => (g.assigneeId ? [g.assigneeId] : [])) } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      const workload = employees.map((employee) => {
        const rows = grouped.filter((g) => g.assigneeId === employee.id);
        return {
          ...employee,
          assigned: rows.reduce((n, r) => n + r._count._all, 0),
          inProgress: rows.find((r) => r.status === 'IN_PROGRESS')?._count._all ?? 0,
          completed: rows.find((r) => r.status === 'COMPLETED')?._count._all ?? 0,
          overdue: overdue.find((r) => r.assigneeId === employee.id)?._count._all ?? 0,
        };
      });
      const trendFrom = q.dateFrom
        ? new Date(q.dateFrom.getTime() - 8 * 3600000)
        : new Date(day.getTime() - 29 * 86400000 - 8 * 3600000);
      const trendTo = q.dateTo
        ? new Date(q.dateTo.getTime() + 16 * 3600000)
        : new Date(day.getTime() + 16 * 3600000);
      const completed = await tx.task.groupBy({
        by: ['completedAt'],
        where: {
          ...taskScope(user),
          project: scope,
          archivedAt: null,
          status: 'COMPLETED',
          completedAt: { gte: trendFrom, lt: trendTo },
        },
        _count: { _all: true },
      });
      const trend = new Map<string, number>();
      for (const row of completed)
        if (row.completedAt) {
          const key = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(row.completedAt);
          trend.set(key, (trend.get(key) ?? 0) + row._count._all);
        }
      const financialProjects = await tx.project.findMany({
        where: { AND: [scope, financialProjectScope(user), { targetDate: dateRange }] },
        select: { id: true, name: true, budget: true },
      });
      const spending = await tx.expense.groupBy({
        by: ['projectId'],
        where: { projectId: { in: financialProjects.map((p) => p.id) } },
        _sum: { amount: true },
      });
      const financialRows = financialProjects.map((project) => ({
        id: project.id,
        name: project.name,
        ...calculatedBudget(
          project.budget,
          money(spending.find((e) => e.projectId === project.id)?._sum.amount),
        ),
      }));
      const allocated = financialProjects.reduce(
        (sum, project) => sum.plus(money(project.budget)),
        money(0),
      );
      const spent = spending.reduce((sum, entry) => sum.plus(money(entry._sum.amount)), money(0));
      const count = (rows: { status: string; _count: { _all: number } }[], status: string) =>
        rows.find((r) => r.status === status)?._count._all ?? 0;
      const milestoneTotal = milestoneStatus.reduce((n, r) => n + r._count._all, 0),
        milestoneDone = count(milestoneStatus, 'COMPLETED');
      const slice = <T>(rows: T[]) =>
        pageResult(
          rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
          rows.length,
          q.page,
          q.pageSize,
        );
      return {
        asOf: day,
        timezone: 'Asia/Manila',
        health: {
          total: projects.length,
          active: projects.filter((p) => p.status === 'ACTIVE').length,
          completed: projects.filter((p) => p.status === 'COMPLETED').length,
          overdue: projects.filter(
            (p) => !['COMPLETED', 'CANCELLED'].includes(p.status) && p.targetDate < day,
          ).length,
          upcoming: projects.filter(
            (p) =>
              !['COMPLETED', 'CANCELLED'].includes(p.status) &&
              p.targetDate >= day &&
              p.targetDate <= soon,
          ).length,
          approachingBudget: financialRows.filter(
            (p) => p.utilization !== null && Number(p.utilization) >= 80,
          ).length,
        },
        projects: slice(projects),
        tasks: {
          total: taskStatus.reduce((n, r) => n + r._count._all, 0),
          completed: count(taskStatus, 'COMPLETED'),
          inProgress: count(taskStatus, 'IN_PROGRESS'),
          overdue: taskOverdue,
          priorities: taskPriority.map((r) => ({ name: r.priority, count: r._count._all })),
          trend: [...trend]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, count]) => ({ date, count })),
        },
        milestones: {
          total: milestoneTotal,
          completed: milestoneDone,
          overdue: milestoneOverdue,
          upcoming: milestoneUpcoming,
          completionRate: milestoneTotal ? Math.round((milestoneDone / milestoneTotal) * 100) : 0,
        },
        workload: slice(workload),
        financial: {
          ...calculatedBudget(allocated.toFixed(2), spent),
          projects: slice(financialRows),
        },
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 30000 },
  );
}
