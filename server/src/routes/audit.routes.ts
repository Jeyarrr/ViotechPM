import { Router } from 'express';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { PublicUser } from '../services/auth.service.js';
import { requirePermission } from '../middleware/auth.js';
import { auditListSchema } from '../validators/report.js';
import { idSchema, listSchema } from '../validators/core.js';
import { isAdmin } from '../services/project.service.js';
import { notFound, pageResult, redactAuditMetadata } from '../services/core.service.js';

export const auditScope = (user: PublicUser): Prisma.AuditLogWhereInput =>
  isAdmin(user)
    ? {}
    : {
        project: { managerId: user.id },
        entityType: { in: ['Project', 'Task', 'Milestone', 'ProjectTransaction', 'Expense'] },
        NOT: { action: 'workflow.access_denied' },
      };
const include = {
  actor: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, code: true } },
} as const;
const payload = <T extends { metadata: unknown }>(item: T) => ({
  ...item,
  metadata: redactAuditMetadata(item.metadata),
});
export function auditRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('audit:read'));
  router.get('/options', async (req, res) => {
    const q = listSchema.strict().parse(req.query),
      scope = auditScope(req.user!);
    const projectScope = isAdmin(req.user!) ? {} : { managerId: req.user!.id };
    const [items, total, actions, projects, projectTotal] = await db.$transaction([
      db.user.findMany({
        where: { auditLogs: { some: scope } },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.user.count({ where: { auditLogs: { some: scope } } }),
      db.auditLog.groupBy({ by: ['action'], where: scope, orderBy: { action: 'asc' } }),
      db.project.findMany({
        where: projectScope,
        select: { id: true, name: true, archivedAt: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.project.count({ where: projectScope }),
    ]);
    res.json({
      data: {
        actors: pageResult(items, total, q.page, q.pageSize),
        actions: actions.map((a) => a.action),
        projects: pageResult(projects, projectTotal, q.page, q.pageSize),
      },
    });
  });
  router.get('/', async (req, res) => {
    const q = auditListSchema.parse(req.query);
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        auditScope(req.user!),
        {
          projectId: q.projectId,
          actorId: q.actorId,
          action: q.action,
          timestamp: {
            gte: q.dateFrom ? new Date(q.dateFrom.getTime() - 8 * 3600000) : undefined,
            lt: q.dateTo ? new Date(q.dateTo.getTime() + 16 * 3600000) : undefined,
          },
          OR: [
            { action: { contains: q.q, mode: 'insensitive' } },
            { entityType: { contains: q.q, mode: 'insensitive' } },
            { entityId: { contains: q.q, mode: 'insensitive' } },
            { actor: { name: { contains: q.q, mode: 'insensitive' } } },
            { project: { name: { contains: q.q, mode: 'insensitive' } } },
          ],
        },
      ],
    };
    const [items, total] = await db.$transaction([
      db.auditLog.findMany({
        where,
        include,
        orderBy: [{ [q.sort]: q.direction }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.auditLog.count({ where }),
    ]);
    res.json({ data: pageResult(items.map(payload), total, q.page, q.pageSize) });
  });
  router.get('/:id', async (req, res) => {
    const item =
      (await db.auditLog.findFirst({
        where: { AND: [auditScope(req.user!), { id: idSchema.parse(req.params.id) }] },
        include,
      })) ?? notFound();
    res.json({ data: payload(item) });
  });
  return router;
}
