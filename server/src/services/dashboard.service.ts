import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { projectScope } from './project.service.js';
import { taskScope, today } from './task.service.js';

export async function overviewData(db: PrismaClient, user: PublicUser) {
  return db.$transaction(
    async (tx) => {
      const projectWhere: Prisma.ProjectWhereInput = { ...projectScope(user), archivedAt: null };
      const taskWhere: Prisma.TaskWhereInput = {
        ...taskScope(user),
        archivedAt: null,
        project: { ...projectScope(user), archivedAt: null },
      };
      const projects = await tx.project.findMany({
        where: projectWhere,
        select: { id: true, name: true, status: true },
      });
      const projectIds = projects.map((p) => p.id);
      const budget = await tx.project.aggregate({ where: projectWhere, _sum: { budget: true } });
      const budgetRows = await tx.project.groupBy({
        by: ['startDate'],
        where: { ...projectWhere, budget: { not: null } },
        _sum: { budget: true },
        orderBy: { startDate: 'asc' },
      });
      const months = new Map<string, number>();
      for (const row of budgetRows) {
        const month = row.startDate.toISOString().slice(0, 7);
        months.set(month, (months.get(month) ?? 0) + (row._sum.budget?.toNumber() ?? 0));
      }
      const pendingTasks = await tx.task.count({
        where: { ...taskWhere, status: { not: 'COMPLETED' } },
      });
      const taskSelect = {
        id: true,
        title: true,
        projectId: true,
        dueDate: true,
        status: true,
        project: { select: { name: true } },
      } as const;
      const deadlines = await tx.task.findMany({
        where: { ...taskWhere, status: { not: 'COMPLETED' }, dueDate: { gte: today() } },
        select: taskSelect,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take: 8,
      });
      const myTasks = await tx.task.findMany({
        where: { ...taskWhere, assigneeId: user.id, status: { not: 'COMPLETED' } },
        select: taskSelect,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take: 8,
      });
      const workload = await tx.task.groupBy({
        by: ['assigneeId', 'status'],
        where: taskWhere,
        _count: true,
      });
      const userIds = [...new Set(workload.flatMap((r) => (r.assigneeId ? [r.assigneeId] : [])))];
      const names = await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      });
      const teamWorkload = [...new Set(workload.map((r) => r.assigneeId))]
        .map((id) => {
          const rows = workload.filter((r) => r.assigneeId === id);
          return {
            userId: id ?? 'unassigned',
            name: names.find((r) => r.id === id)?.name ?? 'Unassigned',
            assignedTasks: rows.reduce((n, r) => n + r._count, 0),
            completedTasks: rows.find((r) => r.status === 'COMPLETED')?._count ?? 0,
          };
        })
        .sort(
          (a, b) =>
            b.assignedTasks - b.completedTasks - (a.assignedTasks - a.completedTasks) ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 8);
      const activityTasks = await tx.task.findMany({
        where: { ...taskScope(user), project: projectWhere },
        select: { id: true, projectId: true },
      });
      const activity = await tx.auditLog.findMany({
        where: {
          OR: [
            { entityType: 'Project', entityId: { in: projectIds } },
            { entityType: 'Task', entityId: { in: activityTasks.map((t) => t.id) } },
          ],
        },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          action: true,
          entityId: true,
          entityType: true,
          timestamp: true,
          actor: { select: { name: true } },
        },
      });
      const taskSummary = (t: (typeof deadlines)[number]) => ({
        id: t.id,
        title: t.title,
        projectId: t.projectId,
        projectName: t.project.name,
        dueAt: t.dueDate.toISOString(),
        status: t.status,
      });
      return {
        phase: 2,
        currency: 'PHP',
        metrics: {
          totalProjects: projects.length,
          activeProjects: projects.filter((p) => p.status === 'ACTIVE').length,
          pendingTasks,
          completedProjects: projects.filter((p) => p.status === 'COMPLETED').length,
          totalBudget: budget._sum.budget?.toNumber() ?? 0,
        },
        projectStatus: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'].map(
          (status) => ({ status, count: projects.filter((p) => p.status === status).length }),
        ),
        budgetSeries: [...months].map(([month, amount]) => ({
          month,
          budget: Math.round(amount * 100) / 100,
        })),
        recentActivity: activity.map((a) => {
          const projectId =
            a.entityType === 'Project'
              ? a.entityId
              : activityTasks.find((t) => t.id === a.entityId)?.projectId;
          const projectName = projects.find((p) => p.id === projectId)?.name ?? 'Project';
          return {
            id: a.id,
            projectId,
            description: `${projectName} · ${a.action.replaceAll('.', ' ').replaceAll('_', ' ')}`,
            actorName: a.actor?.name ?? 'System',
            occurredAt: a.timestamp.toISOString(),
          };
        }),
        deadlines: deadlines.map(taskSummary),
        myTasks: myTasks.map(taskSummary),
        teamWorkload,
      };
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
