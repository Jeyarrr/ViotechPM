import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { idSchema } from '../validators/core.js';
import { dateSchema } from '../validators/project.js';
import { accessibleProject } from '../services/project.service.js';
import { taskScope, canManageProject } from '../services/task.service.js';
import { transactionScope } from '../services/transaction.service.js';
import { audit, notFound, pageResult, conflict } from '../services/core.service.js';
import { AppError } from '../utils/errors.js';

const paging = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
const commentSchema = z
  .object({
    content: z.string().trim().min(1).max(4000),
    mentionIds: z.array(z.uuid()).max(20).default([]),
  })
  .strict();
const commentInclude = {
  author: { select: { id: true, name: true } },
  mentions: { include: { user: { select: { id: true, name: true } } } },
} as const;
type User = NonNullable<Express.Request['user']>;
async function taskAccess(tx: Prisma.TransactionClient, id: string, user: User, write = false) {
  let task =
    (await tx.task.findFirst({ where: { id, ...taskScope(user) }, include: { project: true } })) ??
    notFound();
  if (write) {
    await tx.$queryRaw`SELECT id FROM projects WHERE id = ${task.projectId}::uuid FOR SHARE`;
    task =
      (await tx.task.findFirst({
        where: { id, ...taskScope(user) },
        include: { project: true },
      })) ?? notFound();
    if (task.archivedAt || task.project.archivedAt) conflict('Archived work is read-only.');
  }
  return task;
}
async function eligibleMembers(
  tx: Prisma.TransactionClient,
  task: { projectId: string; assigneeId: string | null; project: { managerId: string } },
) {
  return tx.user.findMany({
    where: {
      status: 'ACTIVE',
      AND: [
        {
          OR: [
            { id: task.project.managerId },
            { memberships: { some: { projectId: task.projectId } } },
          ],
        },
        {
          OR: [
            { role: { key: { not: 'employee' } } },
            { id: task.assigneeId ?? '00000000-0000-0000-0000-000000000000' },
          ],
        },
      ],
    },
    select: { id: true, name: true },
  });
}
export function collaborationRoutes(db: PrismaClient) {
  const router = Router();
  const writeLimit = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Please wait before posting more comments.' },
    },
  });
  router.get('/tasks/:id/mention-options', async (req, res) => {
    const task = await taskAccess(db, idSchema.parse(req.params.id), req.user!);
    res.json({ data: await eligibleMembers(db, task) });
  });
  router.get('/tasks/:id/comments', async (req, res) => {
    const id = idSchema.parse(req.params.id),
      q = paging.strict().parse(req.query);
    const task = await taskAccess(db, id, req.user!);
    const [items, total] = await db.$transaction([
      db.taskComment.findMany({
        where: { taskId: id },
        include: commentInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.taskComment.count({ where: { taskId: id } }),
    ]);
    res.json({
      data: pageResult(
        items.map((item) => {
          const authorEdit =
            item.authorId === req.user!.id && Date.now() - item.createdAt.getTime() <= 86400000;
          const writable = !item.deletedAt && !task.archivedAt && !task.project.archivedAt;
          return {
            ...item,
            content: item.deletedAt ? '' : item.content,
            mentions: item.deletedAt ? [] : item.mentions,
            canEdit: writable && authorEdit,
            canDelete: writable && (authorEdit || canManageProject(req.user!, task.project)),
          };
        }),
        total,
        q.page,
        q.pageSize,
      ),
    });
  });
  router.post('/tasks/:id/comments', writeLimit, async (req, res) => {
    const id = idSchema.parse(req.params.id),
      input = commentSchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const task = await taskAccess(tx, id, req.user!, true);
      const eligible = await eligibleMembers(tx, task),
        ids = new Set(eligible.map((u) => u.id));
      if (input.mentionIds.some((id) => !ids.has(id)))
        throw new AppError(
          422,
          'INVALID_MENTION',
          'Mention only eligible members who can access this task.',
        );
      const item = await tx.taskComment.create({
        data: {
          taskId: id,
          authorId: req.user!.id,
          content: input.content,
          mentions: { create: [...new Set(input.mentionIds)].map((userId) => ({ userId })) },
        },
        include: commentInclude,
      });
      await audit(tx, req.user!.id, 'comment.created', 'Task', id, { commentId: item.id });
      const recipients = new Set(
        [task.assigneeId, task.project.managerId, ...input.mentionIds].filter(
          (v): v is string => !!v && v !== req.user!.id && ids.has(v),
        ),
      );
      await tx.notification.createMany({
        data: [...recipients].map((recipientId) => ({
          recipientId,
          projectId: task.projectId,
          taskId: id,
          entityType: 'Task',
          entityId: id,
          type: input.mentionIds.includes(recipientId) ? 'comment.mentioned' : 'comment.created',
          title: input.mentionIds.includes(recipientId) ? 'You were mentioned' : 'New task comment',
          message: task.title,
          dedupeKey: `comment:${item.id}`,
        })),
        skipDuplicates: true,
      });
      return item;
    });
    res.status(201).json({ data: item });
  });
  for (const method of ['patch', 'delete'] as const)
    router[method]('/tasks/:id/comments/:commentId', writeLimit, async (req, res) => {
      const id = idSchema.parse(req.params.id),
        commentId = idSchema.parse(req.params.commentId);
      const input =
        method === 'patch'
          ? z
              .object({ content: z.string().trim().min(1).max(4000) })
              .strict()
              .parse(req.body)
          : z.object({}).strict().parse(req.body);
      await db.$transaction(async (tx) => {
        const task = await taskAccess(tx, id, req.user!, true);
        await tx.$queryRaw`SELECT id FROM task_comments WHERE id = ${commentId}::uuid FOR UPDATE`;
        const item =
          (await tx.taskComment.findFirst({
            where: { id: commentId, taskId: id, deletedAt: null },
          })) ?? notFound();
        const authorEdit =
          item.authorId === req.user!.id && Date.now() - item.createdAt.getTime() <= 86400000;
        if (!authorEdit && !(method === 'delete' && canManageProject(req.user!, task.project)))
          throw new AppError(
            403,
            'FORBIDDEN',
            'Only the author may edit within 24 hours; project management may moderate deletions.',
          );
        await tx.taskComment.update({
          where: { id: commentId },
          data:
            method === 'delete'
              ? { deletedAt: new Date() }
              : { content: (input as { content: string }).content },
        });
        await audit(
          tx,
          req.user!.id,
          method === 'delete' ? 'comment.deleted' : 'comment.updated',
          'Task',
          id,
          { commentId },
        );
      });
      res.json({
        data: { message: method === 'delete' ? 'Comment deleted.' : 'Comment updated.' },
      });
    });
  router.get('/projects/:id/activities', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    await accessibleProject(db, id, req.user!);
    const q = paging
      .extend({
        type: z
          .enum(['project', 'task', 'milestone', 'transaction', 'comment', 'document'])
          .optional(),
        actorId: z.uuid().optional(),
        dateFrom: dateSchema.optional(),
        dateTo: dateSchema.optional(),
      })
      .strict()
      .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, 'Invalid date range.')
      .parse(req.query);
    const [tasks, transactions] = await Promise.all([
      db.task.findMany({ where: { projectId: id, ...taskScope(req.user!) }, select: { id: true } }),
      db.projectTransaction.findMany({
        where: { projectId: id, ...transactionScope(req.user!) },
        select: { id: true },
      }),
    ]);
    const where: Prisma.AuditLogWhereInput = {
      projectId: id,
      actorId: q.actorId,
      timestamp: {
        gte: q.dateFrom ? new Date(q.dateFrom.getTime() - 8 * 3600000) : undefined,
        lt: q.dateTo ? new Date(q.dateTo.getTime() + 16 * 3600000) : undefined,
      },
      AND: [
        {
          OR: [
            {
              entityType: 'Project',
              OR: [{ action: { startsWith: 'project.' } }, { action: { startsWith: 'document.' } }],
            },
            { entityType: 'Milestone', action: { startsWith: 'milestone.' } },
            {
              entityType: 'Task',
              entityId: { in: tasks.map((t) => t.id) },
              OR: [
                { action: { startsWith: 'task.' } },
                { action: { startsWith: 'comment.' } },
                { action: { startsWith: 'document.' } },
              ],
            },
            {
              entityType: 'ProjectTransaction',
              entityId: { in: transactions.map((t) => t.id) },
              action: {
                in: [
                  'transaction.submitted',
                  'transaction.status_changed',
                  'approval.approve',
                  'approval.reject',
                  'approval.return',
                ],
              },
            },
          ],
        },
        ...(q.type ? [{ action: { startsWith: q.type + '.' } }] : []),
      ],
    };
    const [items, total] = await db.$transaction([
      db.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          timestamp: true,
          entityType: true,
          entityId: true,
          actor: { select: { id: true, name: true } },
        },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.auditLog.count({ where }),
    ]);
    res.json({
      data: pageResult(
        items.map((item) => ({
          ...item,
          description: item.action.replaceAll('.', ' ').replaceAll('_', ' '),
          href:
            item.entityType === 'Task'
              ? `/tasks/${item.entityId}`
              : item.entityType === 'Milestone'
                ? `/milestones/${item.entityId}`
                : item.entityType === 'ProjectTransaction'
                  ? `/transactions/${item.entityId}`
                  : `/projects/${id}`,
        })),
        total,
        q.page,
        q.pageSize,
      ),
    });
  });
  return router;
}
