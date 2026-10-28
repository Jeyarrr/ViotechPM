import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { idSchema } from '../validators/core.js';
import { taskSchema, taskListSchema, taskStatusSchema } from '../validators/task.js';
import { requirePermission } from '../middleware/auth.js';
import { accessibleProject } from '../services/project.service.js';
import {
  taskScope,
  taskInclude,
  validateTask,
  reconcileCompletion,
  canManageProject,
  today,
} from '../services/task.service.js';
import { audit, changedFields, conflict, notFound, pageResult } from '../services/core.service.js';
import { AppError } from '../utils/errors.js';

export function taskRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('tasks:read'));
  const permissions = (
    item: {
      assigneeId: string | null;
      archivedAt: Date | null;
      project: { managerId: string; archivedAt: Date | null };
    },
    user: NonNullable<Express.Request['user']>,
  ) => ({
    canManage: canManageProject(user, item.project),
    canUpdateStatus:
      !item.archivedAt &&
      !item.project.archivedAt &&
      (canManageProject(user, item.project) || item.assigneeId === user.id),
  });
  router.get('/', async (req, res) => {
    const q = taskListSchema.parse(req.query),
      day = today();
    const where: Prisma.TaskWhereInput = {
      AND: [
        taskScope(req.user!),
        {
          archivedAt: q.archived === 'true' ? { not: null } : null,
          project: { archivedAt: null },
          projectId: q.projectId,
          assigneeId: q.mine === 'true' ? req.user!.id : q.assigneeId,
          priority: q.priority,
          status: q.status,
          OR: [
            { title: { contains: q.q, mode: 'insensitive' } },
            { code: { contains: q.q, mode: 'insensitive' } },
          ],
          ...(q.deadline
            ? {
                status: { not: 'COMPLETED' },
                dueDate:
                  q.deadline === 'overdue'
                    ? { lt: day }
                    : { gte: day, lte: new Date(day.getTime() + 7 * 86400000) },
              }
            : {}),
        },
        ...(q.status ? [{ status: q.status }] : []),
      ],
    };
    const [items, total] = await db.$transaction([
      db.task.findMany({
        where,
        include: taskInclude,
        orderBy: [{ [q.sort]: q.direction }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.task.count({ where }),
    ]);
    res.json({
      data: pageResult(
        items.map((item) => ({ ...item, ...permissions(item, req.user!) })),
        total,
        q.page,
        q.pageSize,
      ),
    });
  });
  router.get('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const item =
      (await db.task.findFirst({ where: { id, ...taskScope(req.user!) }, include: taskInclude })) ??
      notFound();
    res.json({ data: { ...item, ...permissions(item, req.user!) } });
  });
  router.post('/', async (req, res) => {
    const input = taskSchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const project = await accessibleProject(tx, input.projectId, req.user!, true);
      if (project.archivedAt) conflict('Restore this project before changing its tasks.');
      await validateTask(tx, input);
      const item = await tx.task.create({
        data: {
          ...input,
          createdById: req.user!.id,
          completedAt: input.status === 'COMPLETED' ? new Date() : null,
        },
        include: taskInclude,
      });
      await audit(tx, req.user!.id, 'task.created', 'Task', item.id, input);
      if (item.completedAt)
        await audit(tx, req.user!.id, 'task.completed', 'Task', item.id, { projectId: project.id });
      await reconcileCompletion(tx, project, req.user!.id);
      return item;
    });
    res.status(201).json({ data: item });
  });
  for (const statusOnly of [false, true]) {
    router.patch(statusOnly ? '/:id/status' : '/:id', async (req, res) => {
      const id = idSchema.parse(req.params.id);
      // Moving a task to another project is deliberately unsupported: its history stays attached.
      const input = statusOnly
        ? z.object({ status: taskStatusSchema }).strict().parse(req.body)
        : taskSchema.omit({ projectId: true }).partial().parse(req.body);
      const item = await db.$transaction(async (tx) => {
        const found =
          (await tx.task.findFirst({ where: { id, ...taskScope(req.user!) } })) ?? notFound();
        await tx.$queryRaw`SELECT id FROM projects WHERE id = ${found.projectId}::uuid FOR UPDATE`;
        const project = await accessibleProject(tx, found.projectId, req.user!, !statusOnly);
        const before =
          (await tx.task.findFirst({ where: { id, ...taskScope(req.user!) } })) ?? notFound();
        if (!canManageProject(req.user!, project) && before.assigneeId !== req.user!.id)
          throw new AppError(
            403,
            'FORBIDDEN',
            'Only the assigned employee may update this task’s progress.',
          );
        if (project.archivedAt || before.archivedAt) conflict('Archived work cannot be edited.');
        const next = { ...before, ...input };
        await validateTask(
          tx,
          next,
          next.assigneeId !== before.assigneeId || next.status !== 'COMPLETED',
        );
        const item = await tx.task.update({
          where: { id },
          data: {
            ...input,
            completedAt: next.status === 'COMPLETED' ? (before.completedAt ?? new Date()) : null,
          },
          include: taskInclude,
        });
        await audit(tx, req.user!.id, 'task.updated', 'Task', id, {
          projectId: project.id,
          changes: changedFields(before, item, Object.keys(input)),
        });
        if (before.assigneeId !== item.assigneeId)
          await audit(tx, req.user!.id, 'task.reassigned', 'Task', id, {
            projectId: project.id,
            before: before.assigneeId,
            after: item.assigneeId,
          });
        if (before.status !== item.status)
          await audit(tx, req.user!.id, 'task.status_changed', 'Task', id, {
            projectId: project.id,
            before: before.status,
            after: item.status,
          });
        if (!before.completedAt && item.completedAt)
          await audit(tx, req.user!.id, 'task.completed', 'Task', id, { projectId: project.id });
        await reconcileCompletion(tx, project, req.user!.id);
        return item;
      });
      res.json({ data: item });
    });
  }
  router.delete('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const item = await db.$transaction(async (tx) => {
      const found =
        (await tx.task.findFirst({ where: { id, ...taskScope(req.user!) } })) ?? notFound();
      const project = await accessibleProject(tx, found.projectId, req.user!, true);
      const before = await tx.task.findUniqueOrThrow({ where: { id } });
      if (project.archivedAt || before.archivedAt) conflict('This work is already archived.');
      const item = await tx.task.update({ where: { id }, data: { archivedAt: new Date() } });
      await audit(tx, req.user!.id, 'task.archived', 'Task', id, { projectId: project.id });
      await reconcileCompletion(tx, project, req.user!.id);
      return item;
    });
    res.json({ data: item });
  });
  return router;
}
