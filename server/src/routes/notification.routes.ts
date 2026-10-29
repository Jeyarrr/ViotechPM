import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { idSchema } from '../validators/core.js';
import { notificationScope, notificationLink } from '../services/notification.service.js';
import { notFound, pageResult } from '../services/core.service.js';

const filters = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    unread: z.enum(['true', 'false']).optional(),
    type: z.string().max(100).optional(),
  })
  .strict();
export function notificationRoutes(db: PrismaClient) {
  const router = Router();
  router.get('/unread-count', async (req, res) => {
    res.json({
      data: {
        count: await db.notification.count({
          where: { ...notificationScope(req.user!), readAt: null },
        }),
      },
    });
  });
  router.get('/', async (req, res) => {
    const q = filters.parse(req.query);
    const where = {
      ...notificationScope(req.user!),
      ...(q.unread === 'true' ? { readAt: null } : {}),
      type: q.type,
    };
    const [items, total] = await db.$transaction([
      db.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.notification.count({ where }),
    ]);
    res.json({
      data: pageResult(
        items.map((item) => ({ ...item, href: notificationLink(item) })),
        total,
        q.page,
        q.pageSize,
      ),
    });
  });
  router.patch('/read-all', async (req, res) => {
    z.object({}).strict().parse(req.body);
    await db.notification.updateMany({
      where: { ...notificationScope(req.user!), readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ data: { message: 'Notifications marked as read.' } });
  });
  router.patch('/:id/read', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    z.object({}).strict().parse(req.body);
    const changed = await db.notification.updateMany({
      where: { id, ...notificationScope(req.user!) },
      data: { readAt: new Date() },
    });
    if (!changed.count) notFound();
    res.json({ data: { message: 'Notification marked as read.' } });
  });
  return router;
}
