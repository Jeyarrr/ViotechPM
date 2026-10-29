import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { idSchema, listSchema } from '../validators/core.js';
import { accessibleProject } from '../services/project.service.js';
import { audit, conflict, notFound, pageResult } from '../services/core.service.js';

export const memberSelect = {
  id: true,
  userId: true,
  role: true,
  assignedAt: true,
  user: { select: { id: true, name: true, email: true, status: true, profileImage: true } },
} as const;
export function memberRoutes(db: PrismaClient) {
  const router = Router({ mergeParams: true });
  router.get<{ id: string }>('/', async (req, res) => {
    const projectId = idSchema.parse(req.params.id);
    await accessibleProject(db, projectId, req.user!);
    const q = listSchema.strict().parse(req.query);
    const where = { projectId, user: { name: { contains: q.q, mode: 'insensitive' as const } } };
    const [items, total] = await db.$transaction([
      db.projectMember.findMany({
        where,
        select: memberSelect,
        orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.projectMember.count({ where }),
    ]);
    res.json({ data: pageResult(items, total, q.page, q.pageSize) });
  });
  router.post<{ id: string }>('/', async (req, res) => {
    const projectId = idSchema.parse(req.params.id);
    const input = z
      .object({ userId: idSchema, role: z.string().trim().min(2).max(80).default('Member') })
      .strict()
      .parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const project = await accessibleProject(tx, projectId, req.user!, true);
      if (project.archivedAt) conflict('Restore this project before changing its team.');
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR SHARE`;
      if (!(await tx.user.findFirst({ where: { id: input.userId, status: 'ACTIVE' } })))
        conflict('Select an active employee.');
      const item = await tx.projectMember.create({
        data: { ...input, projectId, assignedById: req.user!.id },
        select: memberSelect,
      });
      await audit(tx, req.user!.id, 'project.member_assigned', 'Project', projectId, input);
      return item;
    });
    res.status(201).json({ data: item });
  });
  router.delete<{ id: string; userId: string }>('/:userId', async (req, res) => {
    const projectId = idSchema.parse(req.params.id),
      userId = idSchema.parse(req.params.userId);
    await db.$transaction(async (tx) => {
      const project = await accessibleProject(tx, projectId, req.user!, true);
      if (project.archivedAt) conflict('Restore this project before changing its team.');
      if (project.managerId === userId)
        conflict('Change the project manager before removing this member.');
      if (
        await tx.milestone.count({
          where: {
            projectId,
            responsibleId: userId,
            archivedAt: null,
            status: { not: 'COMPLETED' },
          },
        })
      )
        conflict('Reassign this member’s unfinished milestones before removing them.');
      if (
        await tx.task.count({
          where: { projectId, assigneeId: userId, archivedAt: null, status: { not: 'COMPLETED' } },
        })
      )
        conflict('Reassign or unassign this member’s unfinished tasks before removing them.');
      const member =
        (await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId } },
        })) ?? notFound();
      await tx.projectMember.delete({ where: { id: member.id } });
      await audit(tx, req.user!.id, 'project.member_removed', 'Project', projectId, {
        userId,
        role: member.role,
      });
    });
    res.json({ data: { removed: true } });
  });
  return router;
}
