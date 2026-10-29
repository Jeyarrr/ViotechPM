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
  projectProgress,
} from '../services/project.service.js';
import { memberRoutes, memberSelect } from './member.routes.js';
import { taskScope, taskInclude, today } from '../services/task.service.js';
import { approvalPolicyRoutes } from './approval.routes.js';
import {
  financialProjectScope,
  projectBudgetSummary,
  validateBudgetChange,
} from '../services/expense.service.js';
import { notFound } from '../services/core.service.js';

export function projectRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('projects:read'));
  router.use('/:id/members', memberRoutes(db));
  router.use('/:id/approval-policy', approvalPolicyRoutes(db));
  router.get('/:id/budget-summary', requirePermission('expenses:read'), async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const data = await db.$transaction(
      async (tx) => {
        const project =
          (await tx.project.findFirst({ where: { id, ...financialProjectScope(req.user!) } })) ??
          notFound();
        return projectBudgetSummary(tx, project);
      },
      { isolationLevel: 'RepeatableRead' },
    );
    res.json({ data });
  });
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
    const progress = await projectProgress(
      db,
      items.map((item) => item.id),
    );
    res.json({
      data: pageResult(
        items.map((item) => ({ ...item, ...progress.get(item.id) })),
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
      where: {
        OR: [
          { entityType: 'Project', entityId: id },
          { entityType: 'Task', metadata: { path: ['projectId'], equals: id } },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: { id: true, action: true, timestamp: true, actor: { select: { name: true } } },
    });
    res.json({
      data: {
        ...project,
        ...(await projectProgress(db, [id])).get(id),
        members: await db.projectMember.findMany({
          where: { projectId: id },
          select: memberSelect,
          orderBy: { assignedAt: 'asc' },
          take: 20,
        }),
        tasks: await db.task.findMany({
          where: { projectId: id, archivedAt: null, ...taskScope(req.user!) },
          include: taskInclude,
          orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
          take: 10,
        }),
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
      await tx.projectMember.create({
        data: {
          projectId: item.id,
          userId: item.managerId,
          role: 'Project manager',
          assignedById: req.user!.id,
        },
      });
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
      if ('budget' in input) await validateBudgetChange(tx, id, input.budget ?? null);
      const item = await tx.project.update({
        where: { id },
        data: {
          ...input,
          actualCompletionDate:
            (input.status ?? before.status) === 'COMPLETED'
              ? (before.actualCompletionDate ?? today())
              : null,
        },
        include: projectInclude,
      });
      if (before.managerId !== item.managerId) {
        if (
          await tx.approvalStep.count({
            where: {
              assignedApproverId: before.managerId,
              sequence: 1,
              state: { in: ['PENDING', 'WAITING'] },
              workflow: { status: 'ACTIVE', transaction: { projectId: id } },
            },
          })
        )
          conflict(
            'Reassign pending project reviews to an active Super Admin before changing the manager.',
          );
        await tx.projectMember.updateMany({
          where: { projectId: id, userId: before.managerId },
          data: { role: 'Member' },
        });
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: id, userId: item.managerId } },
          create: {
            projectId: id,
            userId: item.managerId,
            role: 'Project manager',
            assignedById: req.user!.id,
          },
          update: { role: 'Project manager' },
        });
        await audit(tx, req.user!.id, 'project.manager_assigned', 'Project', id, {
          before: before.managerId,
          after: item.managerId,
        });
      }
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
      if (before.budget?.toString() !== item.budget?.toString())
        await audit(tx, req.user!.id, 'project.budget_changed', 'Project', id, {
          before: before.budget?.toFixed(2) ?? null,
          after: item.budget?.toFixed(2) ?? null,
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
