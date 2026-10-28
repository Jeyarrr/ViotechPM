import { Router } from 'express';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { requirePermission } from '../middleware/auth.js';
import { clientSchema, clientListSchema, idSchema } from '../validators/core.js';
import { audit, changedFields, conflict, notFound, pageResult } from '../services/core.service.js';

export function clientRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('clients:read'));
  router.get('/', async (req, res) => {
    const q = clientListSchema.parse(req.query);
    const where: Prisma.ClientWhereInput = {
      archivedAt: q.archived === 'true' ? { not: null } : null,
      status: q.status,
      OR: ['name', 'code', 'contactPerson'].map((field) => ({
        [field]: { contains: q.q, mode: 'insensitive' },
      })),
    };
    const [items, total] = await db.$transaction([
      db.client.findMany({
        where,
        orderBy: [{ [q.sort]: q.direction }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.client.count({ where }),
    ]);
    res.json({ data: pageResult(items, total, q.page, q.pageSize) });
  });
  router.get('/:id', async (req, res) => {
    const item = await db.client.findUnique({ where: { id: idSchema.parse(req.params.id) } });
    res.json({ data: item ?? notFound() });
  });
  router.post('/', requirePermission('clients:write'), async (req, res) => {
    const input = clientSchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const item = await tx.client.create({ data: { ...input, createdById: req.user!.id } });
      await audit(tx, req.user!.id, 'client.created', 'Client', item.id, input);
      return item;
    });
    res.status(201).json({ data: item });
  });
  router.patch('/:id', requirePermission('clients:write'), async (req, res) => {
    const id = idSchema.parse(req.params.id),
      input = clientSchema.partial().parse(req.body);
    const item = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM clients WHERE id = ${id}::uuid FOR UPDATE`;
      const before = (await tx.client.findUnique({ where: { id } })) ?? notFound();
      if (before.archivedAt) conflict('Restore this client before editing.');
      const item = await tx.client.update({ where: { id }, data: input });
      await audit(
        tx,
        req.user!.id,
        'client.updated',
        'Client',
        id,
        changedFields(before, item, Object.keys(input)),
      );
      return item;
    });
    res.json({ data: item });
  });
  for (const restore of [false, true]) {
    const handler = async (req: import('express').Request, res: import('express').Response) => {
      const id = idSchema.parse(req.params.id);
      const item = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM clients WHERE id = ${id}::uuid FOR UPDATE`;
        const before = (await tx.client.findUnique({ where: { id } })) ?? notFound();
        if (!!before.archivedAt !== restore)
          conflict(restore ? 'Client is already restored.' : 'Client is already archived.');
        const item = await tx.client.update({
          where: { id },
          data: { archivedAt: restore ? null : new Date() },
        });
        await audit(
          tx,
          req.user!.id,
          restore ? 'client.restored' : 'client.archived',
          'Client',
          id,
        );
        return item;
      });
      res.json({ data: item });
    };
    if (restore) router.post('/:id/restore', requirePermission('clients:write'), handler);
    else router.delete('/:id', requirePermission('clients:write'), handler);
  }
  return router;
}
