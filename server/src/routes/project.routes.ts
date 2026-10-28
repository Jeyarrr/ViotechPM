import { Router } from 'express';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { requirePermission } from '../middleware/auth.js';
import { idSchema } from '../validators/core.js';
import { projectSchema, projectListSchema } from '../validators/project.js';
import { audit, changedFields, conflict, pageResult } from '../services/core.service.js';
import {
  accessibleProject,
  projectScope,
  projectInclude,
  validateProject,
  isAdmin,
} from '../services/project.service.js';

export function projectRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('projects:read'));
  router.get('/', async (req, res) => {
    const q = projectListSchema.parse(req.query);
    const where: Prisma.ProjectWhereInput = {
      AND: [
        projectScope(req.user!),
        {
          archivedAt: q.archived === 'true' ? { not: null } : null,
          status: q.status,
          priority: q.priority,
          clientId: q.clientId,
          managerId: q.managerId,
          categoryId: q.categoryId,
          OR: ['name', 'code'].map((field) => ({
            [field]: { contains: q.q, mode: 'insensitive' },
          })),
        },
      ],
    };
    const [items, total] = await db.$transaction([
      db.project.findMany({
        where,
        include: projectInclude,
        orderBy: [{ [q.sort]: q.direction }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.project.count({ where }),
    ]);
    res.json({
      data: pageResult(
        items.map((item) => ({ ...item, progress: 0, totalTasks: 0, completedTasks: 0 })),
        total,
        q.page,
        q.pageSize,
      ),
    });
  });
  router.get('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const project = await accessibleProject(db, id, req.user!);
    const activity = await db.auditLog.findMany({
      where: { entityType: 'Project', entityId: id },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: { id: true, action: true, timestamp: true, actor: { select: { name: true } } },
    });
    res.json({
      data: {
        ...project,
        progress: 0,
        totalTasks: 0,
        completedTasks: 0,
        members: [],
        tasks: [],
        activity,
        canManage:
          isAdmin(req.user!) ||
          (req.user!.role.key === 'project_manager' && project.managerId === req.user!.id),
      },
    });
  });
  router.post('/', requirePermission('projects:write'), async (req, res) => {
    const input = projectSchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      await validateProject(tx, input, req.user!);
      const item = await tx.project.create({
        data: { ...input, createdById: req.user!.id },
        include: projectInclude,
      });
      await audit(tx, req.user!.id, 'project.created', 'Project', item.id, input);
      return item;
    });
    res.status(201).json({ data: item });
  });
  router.patch('/:id', requirePermission('projects:write'), async (req, res) => {
    const id = idSchema.parse(req.params.id),
      input = projectSchema.partial().parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const before = await accessibleProject(tx, id, req.user!, true);
      if (before.archivedAt) conflict('Restore this project before editing.');
      await validateProject(tx, { ...before, ...input }, req.user!, before);
      const item = await tx.project.update({
        where: { id },
        data: { ...input, actualCompletionDate: null },
        include: projectInclude,
      });
      await audit(
        tx,
        req.user!.id,
        'project.updated',
        'Project',
        id,
        changedFields(before, item, Object.keys(input)),
      );
      if (before.status !== item.status)
        await audit(tx, req.user!.id, 'project.status_changed', 'Project', id, {
          before: before.status,
          after: item.status,
        });
      return item;
    });
    res.json({ data: item });
  });
  for (const restore of [false, true]) {
    const handler = async (req: import('express').Request, res: import('express').Response) => {
      const id = idSchema.parse(req.params.id);
      const item = await db.$transaction(async (tx) => {
        const before = await accessibleProject(tx, id, req.user!, true);
        if (!!before.archivedAt !== restore)
          conflict(restore ? 'Project is already restored.' : 'Project is already archived.');
        const item = await tx.project.update({
          where: { id },
          data: { archivedAt: restore ? null : new Date() },
        });
        await audit(
          tx,
          req.user!.id,
          restore ? 'project.restored' : 'project.archived',
          'Project',
          id,
        );
        return item;
      });
      res.json({ data: item });
    };
    if (restore) router.post('/:id/restore', requirePermission('projects:write'), handler);
    else router.delete('/:id', requirePermission('projects:write'), handler);
  }
  return router;
}
