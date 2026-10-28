import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import { listSchema, idSchema } from '../validators/core.js';
import { categorySchema } from '../validators/project.js';
import { requirePermission } from '../middleware/auth.js';
import { audit, pageResult } from '../services/core.service.js';
import { AppError } from '../utils/errors.js';
import { isAdmin, projectScope } from '../services/project.service.js';

export function lookupRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('projects:read'));
  router.get('/:kind', async (req, res) => {
    const kind = z
      .enum([
        'clients',
        'managers',
        'departments',
        'categories',
        'roles',
        'employees',
        'projects',
        'assignees',
      ])
      .parse(req.params.kind);
    const q = listSchema
      .extend({ includeInactive: z.enum(['false', 'true']).default('false') })
      .strict()
      .parse(req.query);
    const user = req.user!,
      admin = isAdmin(user);
    if (
      (['clients', 'managers', 'employees'].includes(kind) &&
        !user.permissions.includes('projects:write')) ||
      (kind === 'roles' && !admin) ||
      (q.includeInactive === 'true' && !admin)
    )
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to these options.');
    const paging = {
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
    };
    const search = { name: { contains: q.q, mode: 'insensitive' as const } };
    let items: { id: string; name: string }[], total: number;
    if (kind === 'clients') {
      const where = { ...search, archivedAt: null, status: 'ACTIVE' as const };
      [items, total] = await db.$transaction([
        db.client.findMany({ where, ...paging, select: { id: true, name: true, code: true } }),
        db.client.count({ where }),
      ]);
    } else if (kind === 'managers' || kind === 'employees' || kind === 'assignees') {
      const where = {
        ...search,
        status: 'ACTIVE' as const,
        ...(kind === 'assignees'
          ? {
              memberships: { some: { project: projectScope(user) } },
              ...(user.role.key === 'employee' ? { id: user.id } : {}),
            }
          : {}),
        ...(kind === 'managers'
          ? {
              role: { key: { in: ['super_admin', 'project_manager'] } },
              ...(!admin ? { id: user.id } : {}),
            }
          : {}),
      };
      [items, total] = await db.$transaction([
        db.user.findMany({ where, ...paging, select: { id: true, name: true } }),
        db.user.count({ where }),
      ]);
    } else if (kind === 'categories') {
      const where = { ...search, ...(q.includeInactive === 'true' ? {} : { active: true }) };
      [items, total] = await db.$transaction([
        db.projectCategory.findMany({ where, ...paging }),
        db.projectCategory.count({ where }),
      ]);
    } else if (kind === 'departments') {
      [items, total] = await db.$transaction([
        db.department.findMany({ where: search, ...paging, select: { id: true, name: true } }),
        db.department.count({ where: search }),
      ]);
    } else if (kind === 'roles') {
      [items, total] = await db.$transaction([
        db.role.findMany({ where: search, ...paging, select: { id: true, name: true, key: true } }),
        db.role.count({ where: search }),
      ]);
    } else {
      const where = { AND: [projectScope(user), { ...search, archivedAt: null }] };
      [items, total] = await db.$transaction([
        db.project.findMany({ where, ...paging, select: { id: true, name: true, code: true } }),
        db.project.count({ where }),
      ]);
    }
    res.json({ data: pageResult(items, total, q.page, q.pageSize) });
  });
  return router;
}
export function categoryRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('system:manage'));
  router.post('/', async (req, res) => {
    const input = categorySchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const row = await tx.projectCategory.create({ data: input });
      await audit(tx, req.user!.id, 'category.created', 'ProjectCategory', row.id, input);
      return row;
    });
    res.status(201).json({ data: item });
  });
  router.patch('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id),
      input = categorySchema.partial().parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const row = await tx.projectCategory.update({ where: { id }, data: input });
      await audit(tx, req.user!.id, 'category.updated', 'ProjectCategory', id, input);
      return row;
    });
    res.json({ data: item });
  });
  return router;
}
