import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { requirePermission } from '../middleware/auth.js';
import { idSchema } from '../validators/core.js';
import {
  milestoneSchema,
  milestoneListSchema,
  milestoneStatusSchema,
} from '../validators/milestone.js';
import { accessibleProject } from '../services/project.service.js';
import { audit, changedFields, conflict, pageResult } from '../services/core.service.js';
import {
  accessibleMilestone,
  milestoneInclude,
  milestonePayload,
  milestoneScope,
  validateMilestone,
  reconcileProjectMilestones,
  reconcileMilestones,
} from '../services/milestone.service.js';
import { taskInclude, taskScope, today } from '../services/task.service.js';
import { AppError } from '../utils/errors.js';

export function milestoneWhere(
  q: ReturnType<typeof milestoneListSchema.parse>,
  user: NonNullable<Express.Request['user']>,
): Prisma.MilestoneWhereInput {
  const day = today();
  return {
    AND: [
      milestoneScope(user),
      {
        archivedAt: q.archived === 'true' ? { not: null } : null,
        project: { archivedAt: null },
        projectId: q.projectId,
        responsibleId: q.responsibleId,
        status: q.status,
        priority: q.priority,
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { description: { contains: q.q, mode: 'insensitive' } },
        ],
        ...(q.overdue === 'true' ? { dueDate: { lt: day }, status: { not: 'COMPLETED' } } : {}),
      },
      ...(q.status ? [{ status: q.status }] : []),
      ...(q.overdue === 'false'
        ? [{ OR: [{ dueDate: { gte: day } }, { status: 'COMPLETED' as const }] }]
        : []),
    ],
  };
}
export function milestoneRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('milestones:read'));
  router.get('/', async (req, res) => {
    const q = milestoneListSchema.parse(req.query),
      where = milestoneWhere(q, req.user!);
    const [items, total] = await db.$transaction([
      db.milestone.findMany({
        where,
        include: milestoneInclude,
        orderBy: [{ [q.sort]: q.direction }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.milestone.count({ where }),
    ]);
    res.json({
      data: pageResult(
        items.map((item) => milestonePayload(item, req.user!)),
        total,
        q.page,
        q.pageSize,
      ),
    });
  });
  router.get('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id),
      item = await accessibleMilestone(db, id, req.user!);
    const activity = await db.auditLog.findMany({
      where: { entityType: 'Milestone', entityId: id },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: 20,
      select: { id: true, action: true, timestamp: true, actor: { select: { name: true } } },
    });
    const tasks = await db.task.findMany({
      where: { AND: [taskScope(req.user!), { milestoneId: id, archivedAt: null }] },
      include: taskInclude,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: 10,
    });
    res.json({ data: { ...milestonePayload(item, req.user!), activity, tasks } });
  });
  router.post('/', async (req, res) => {
    const input = milestoneSchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const project = await accessibleProject(tx, input.projectId, req.user!, true);
      if (project.archivedAt) conflict('Restore the project before changing milestones.');
      await validateMilestone(tx, input);
      const item = await tx.milestone.create({
        data: {
          ...input,
          createdById: req.user!.id,
          completedAt: input.status === 'COMPLETED' ? new Date() : null,
        },
        include: milestoneInclude,
      });
      await audit(tx, req.user!.id, 'milestone.created', 'Milestone', item.id, input);
      if (item.completedAt)
        await audit(tx, req.user!.id, 'milestone.completed', 'Milestone', item.id, {
          projectId: project.id,
        });
      await reconcileProjectMilestones(tx, project, req.user!.id);
      return item;
    });
    res.status(201).json({ data: milestonePayload(item, req.user!) });
  });
  router.patch('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id),
      input = milestoneSchema.omit({ projectId: true }).partial().parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const found = await accessibleMilestone(tx, id, req.user!);
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${found.projectId}::uuid FOR UPDATE`;
      const before = await accessibleMilestone(tx, id, req.user!),
        flags = milestonePayload(before, req.user!);
      const project = await accessibleProject(tx, before.projectId, req.user!);
      if (!flags.canManage) {
        if (!flags.canUpdateStatus)
          throw new AppError(
            403,
            'FORBIDDEN',
            'Only the manager or assigned responsible employee may change milestone progress.',
          );
        z.object({ status: milestoneStatusSchema }).strict().parse(req.body);
        if (input.status === 'COMPLETED' && !before.tasks.length)
          throw new AppError(
            403,
            'FORBIDDEN',
            'A project manager must manually complete milestones without linked tasks.',
          );
      }
      if (before.archivedAt || project.archivedAt)
        conflict('Archived milestones and projects cannot be edited.');
      const next = { ...before, ...input };
      await validateMilestone(tx, next, before);
      const item = await tx.milestone.update({
        where: { id },
        data: {
          ...input,
          completedAt: next.status === 'COMPLETED' ? (before.completedAt ?? new Date()) : null,
        },
        include: milestoneInclude,
      });
      await audit(tx, req.user!.id, 'milestone.updated', 'Milestone', id, {
        projectId: project.id,
        changes: changedFields(before, item, Object.keys(input)),
      });
      if (before.status !== item.status)
        await audit(
          tx,
          req.user!.id,
          item.status === 'COMPLETED' ? 'milestone.completed' : 'milestone.status_changed',
          'Milestone',
          id,
          { projectId: project.id, before: before.status, after: item.status },
        );
      await reconcileProjectMilestones(tx, project, req.user!.id);
      return item;
    });
    res.json({ data: milestonePayload(item, req.user!) });
  });
  for (const restore of [false, true]) {
    const handler = async (req: import('express').Request, res: import('express').Response) => {
      const id = idSchema.parse(req.params.id);
      const item = await db.$transaction(async (tx) => {
        const found = await accessibleMilestone(tx, id, req.user!);
        const project = await accessibleProject(tx, found.projectId, req.user!, true);
        const before = await accessibleMilestone(tx, id, req.user!);
        if (project.archivedAt) conflict('Restore the project before changing milestones.');
        if (!!before.archivedAt !== restore)
          conflict(restore ? 'Milestone is already restored.' : 'Milestone is already archived.');
        await tx.milestone.update({
          where: { id },
          data: { archivedAt: restore ? null : new Date() },
        });
        await audit(
          tx,
          req.user!.id,
          restore ? 'milestone.restored' : 'milestone.archived',
          'Milestone',
          id,
          { projectId: project.id },
        );
        if (restore) {
          await reconcileMilestones(tx, [id], req.user!.id);
          await reconcileProjectMilestones(tx, project, req.user!.id);
        }
        return tx.milestone.findUniqueOrThrow({ where: { id }, include: milestoneInclude });
      });
      res.json({ data: milestonePayload(item, req.user!) });
    };
    if (restore) router.post('/:id/restore', handler);
    else router.delete('/:id', handler);
  }
  return router;
}
