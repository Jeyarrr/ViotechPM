import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { requirePermission } from '../middleware/auth.js';
import { idSchema, listSchema } from '../validators/core.js';
import { optionalId } from '../validators/project.js';
import { passwordOptions } from '../services/auth.service.js';
import { publicUserSelect } from '../repositories/user.repository.js';
import { audit, changedFields, conflict, notFound, pageResult } from '../services/core.service.js';
import { projectScope } from '../services/project.service.js';
import { AppError } from '../utils/errors.js';

const employeeSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    roleId: idSchema,
    departmentId: optionalId,
  })
  .strict();
const createSchema = employeeSchema.extend({ password: z.string().min(14).max(128) });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict();
const querySchema = listSchema
  .omit({ archived: true })
  .extend({
    sort: z.enum(['name', 'email', 'createdAt']).default('name'),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    roleId: idSchema.optional(),
    departmentId: idSchema.optional(),
  })
  .strict();

export function employeeRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('team:read'));
  const selectFor = (user: NonNullable<Express.Request['user']>) =>
    ({
      ...publicUserSelect,
      roleId: true,
      departmentId: true,
      memberships: {
        where: { project: projectScope(user) },
        select: {
          project: { select: { id: true, name: true, code: true, archivedAt: true } },
        },
      },
    }) as const;
  router.get('/', async (req, res) => {
    const q = querySchema.parse(req.query);
    const where: Prisma.UserWhereInput = {
      status: q.status,
      roleId: q.roleId,
      departmentId: q.departmentId,
      OR: [
        { name: { contains: q.q, mode: 'insensitive' } },
        { email: { contains: q.q, mode: 'insensitive' } },
      ],
    };
    const [items, total] = await db.$transaction([
      db.user.findMany({
        where,
        select: selectFor(req.user!),
        orderBy: [{ [q.sort]: q.direction }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.user.count({ where }),
    ]);
    res.json({ data: pageResult(items, total, q.page, q.pageSize) });
  });
  router.get('/:id', async (req, res) => {
    const item =
      (await db.user.findUnique({
        where: { id: idSchema.parse(req.params.id) },
        select: selectFor(req.user!),
      })) ?? notFound();
    res.json({ data: item });
  });
  async function references(
    tx: Prisma.TransactionClient,
    roleId?: string,
    departmentId?: string | null,
  ) {
    if (roleId && !(await tx.role.findUnique({ where: { id: roleId } })))
      conflict('Select an existing role.');
    if (departmentId && !(await tx.department.findUnique({ where: { id: departmentId } })))
      conflict('Select an existing department.');
  }
  router.post('/', requirePermission('system:manage'), async (req, res) => {
    const { password, ...input } = createSchema.parse(req.body);
    const passwordHash = await argon2.hash(password, passwordOptions);
    const item = await db.$transaction(async (tx) => {
      await references(tx, input.roleId, input.departmentId);
      const item = await tx.user.create({
        data: { ...input, passwordHash },
        select: selectFor(req.user!),
      });
      await audit(tx, req.user!.id, 'employee.created', 'User', item.id, input);
      return item;
    });
    res.status(201).json({ data: item });
  });
  for (const statusOnly of [false, true]) {
    router.patch(
      statusOnly ? '/:id/status' : '/:id',
      requirePermission('system:manage'),
      async (req, res) => {
        const id = idSchema.parse(req.params.id);
        const input = statusOnly
          ? statusSchema.parse(req.body)
          : employeeSchema.partial().parse(req.body);
        const item = await db.$transaction(async (tx) => {
          // Serialize administrator changes, including concurrent last-admin demotions.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(74219230)`;
          const actor = await tx.user.findUnique({
            where: { id: req.user!.id },
            include: { role: true },
          });
          if (actor?.status !== 'ACTIVE' || actor.role.key !== 'super_admin')
            throw new AppError(403, 'FORBIDDEN', 'An active Super Admin is required.');
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
          const before =
            (await tx.user.findUnique({ where: { id }, include: { role: true } })) ?? notFound();
          const next = { ...before, ...input };
          await references(tx, next.roleId, next.departmentId);
          const role = await tx.role.findUniqueOrThrow({ where: { id: next.roleId } });
          if (
            (next.status !== 'ACTIVE' || next.roleId !== before.roleId) &&
            (await tx.approvalStep.count({
              where: {
                assignedApproverId: id,
                state: { in: ['PENDING', 'WAITING'] },
                workflow: { status: 'ACTIVE' },
              },
            }))
          )
            conflict(
              'Reassign this employee’s pending approval stages before changing their account access.',
            );
          if (
            before.role.key === 'super_admin' &&
            before.status === 'ACTIVE' &&
            (next.status !== 'ACTIVE' || role.key !== 'super_admin')
          ) {
            const count = await tx.user.count({
              where: { status: 'ACTIVE', role: { key: 'super_admin' } },
            });
            if (count <= 1)
              conflict('The last active Super Admin cannot be deactivated or demoted.');
          }
          if (next.status !== 'ACTIVE' || !['super_admin', 'project_manager'].includes(role.key)) {
            if (
              await tx.project.count({
                where: {
                  managerId: id,
                  archivedAt: null,
                  status: { notIn: ['COMPLETED', 'CANCELLED'] },
                },
              })
            )
              conflict('Assign a new manager to this employee’s open projects first.');
          }
          if (
            next.status !== 'ACTIVE' &&
            (await tx.task.count({
              where: {
                assigneeId: id,
                archivedAt: null,
                status: { not: 'COMPLETED' },
                project: { archivedAt: null },
              },
            }))
          )
            conflict('Reassign or unassign this employee’s unfinished tasks first.');
          if (
            next.status !== 'ACTIVE' &&
            (await tx.milestone.count({
              where: {
                responsibleId: id,
                archivedAt: null,
                status: { not: 'COMPLETED' },
                project: { archivedAt: null },
              },
            }))
          )
            conflict('Reassign this employee’s unfinished milestones first.');
          const item = await tx.user.update({
            where: { id },
            data: input,
            select: selectFor(req.user!),
          });
          if (next.status === 'INACTIVE')
            await tx.$executeRaw`DELETE FROM sessions WHERE sess->>'userId' = ${id}`;
          await audit(
            tx,
            req.user!.id,
            'employee.updated',
            'User',
            id,
            changedFields(before, item, Object.keys(input)),
          );
          if (before.roleId !== next.roleId)
            await audit(tx, req.user!.id, 'employee.role_changed', 'User', id, {
              before: before.roleId,
              after: next.roleId,
            });
          if (before.status !== next.status)
            await audit(tx, req.user!.id, 'employee.status_changed', 'User', id, {
              before: before.status,
              after: next.status,
            });
          return item;
        });
        res.json({ data: item });
      },
    );
  }
  return router;
}
