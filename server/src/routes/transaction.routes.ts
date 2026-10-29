import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { requirePermission } from '../middleware/auth.js';
import { idSchema, listSchema } from '../validators/core.js';
import {
  transactionSchema,
  transactionListSchema,
  reasonSchema,
} from '../validators/transaction.js';
import { accessibleProject, isAdmin } from '../services/project.service.js';
import { audit, changedFields, conflict, pageResult } from '../services/core.service.js';
import {
  accessibleTransaction,
  transactionInclude,
  transactionWhere,
  transactionPermissions,
  validateTransactionType,
  assertRequester,
  resolveReviewers,
  workflowInclude,
} from '../services/transaction.service.js';
import { today } from '../services/task.service.js';
import { AppError } from '../utils/errors.js';

export function transactionRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('transactions:read'));
  router.get('/', async (req, res) => {
    const q = transactionListSchema.parse(req.query),
      where = transactionWhere(q, req.user!);
    const [items, total] = await db.$transaction([
      db.projectTransaction.findMany({
        where,
        include: {
          ...transactionInclude,
          workflows: { orderBy: { attempt: 'desc' }, take: 1, include: workflowInclude },
        },
        orderBy: [{ [q.sort]: q.direction }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.projectTransaction.count({ where }),
    ]);
    res.json({
      data: pageResult(
        items.map((t) => ({ ...t, ...transactionPermissions(t, req.user!) })),
        total,
        q.page,
        q.pageSize,
      ),
    });
  });
  router.get('/:id/history', async (req, res) => {
    const id = idSchema.parse(req.params.id),
      q = listSchema.strict().parse(req.query);
    await accessibleTransaction(db, id, req.user!);
    const [items, total] = await db.$transaction([
      db.approvalWorkflow.findMany({
        where: { transactionId: id },
        include: workflowInclude,
        orderBy: { attempt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.approvalWorkflow.count({ where: { transactionId: id } }),
    ]);
    res.json({ data: pageResult(items, total, q.page, q.pageSize) });
  });
  router.get('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id),
      item = await accessibleTransaction(db, id, req.user!);
    const currentWorkflow = await db.approvalWorkflow.findFirst({
      where: { transactionId: id },
      orderBy: { attempt: 'desc' },
      include: workflowInclude,
    });
    const activity = await db.auditLog.findMany({
      where: { entityType: 'ProjectTransaction', entityId: id },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: 30,
      select: { id: true, action: true, timestamp: true, actor: { select: { name: true } } },
    });
    const currentStep = currentWorkflow?.steps.find(
      (s) => s.sequence === currentWorkflow.currentStage,
    );
    const canReview =
      item.requesterId !== req.user!.id &&
      currentWorkflow?.status === 'ACTIVE' &&
      currentStep?.state === 'PENDING' &&
      currentStep.assignedApproverId === req.user!.id &&
      !item.project.archivedAt;
    res.json({
      data: {
        ...item,
        ...transactionPermissions(item, req.user!),
        currentWorkflow,
        activity,
        canReview: !!canReview,
      },
    });
  });
  router.post('/', requirePermission('transactions:write'), async (req, res) => {
    const input = transactionSchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const project = await accessibleProject(tx, input.projectId, req.user!);
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${project.id}::uuid FOR UPDATE`;
      const current = await accessibleProject(tx, project.id, req.user!);
      if (current.archivedAt) conflict('Restore the project before creating requests.');
      await validateTransactionType(tx, input.typeId);
      const item = await tx.projectTransaction.create({
        data: {
          ...input,
          reference: `TX-${today().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(5).toString('hex').toUpperCase()}`,
          requesterId: req.user!.id,
          departmentId: current.departmentId ?? req.user!.department?.id ?? null,
        },
        include: transactionInclude,
      });
      await audit(tx, req.user!.id, 'transaction.created', 'ProjectTransaction', item.id, {
        ...input,
        reference: item.reference,
      });
      return item;
    });
    res.status(201).json({ data: { ...item, ...transactionPermissions(item, req.user!) } });
  });
  router.patch('/:id', requirePermission('transactions:write'), async (req, res) => {
    const id = idSchema.parse(req.params.id),
      input = transactionSchema.omit({ projectId: true }).partial().parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const before = await accessibleTransaction(tx, id, req.user!, true);
      assertRequester(before, req.user!);
      if (!['DRAFT', 'RETURNED_FOR_REVISION'].includes(before.status))
        conflict('Only Draft or Returned for Revision requests may be edited.');
      const project = await accessibleProject(tx, before.projectId, req.user!);
      if (project.archivedAt) conflict('Restore the project before editing requests.');
      await validateTransactionType(tx, input.typeId ?? before.typeId, before.typeId);
      const item = await tx.projectTransaction.update({
        where: { id },
        data: input,
        include: transactionInclude,
      });
      await audit(
        tx,
        req.user!.id,
        before.status === 'RETURNED_FOR_REVISION' ? 'transaction.revised' : 'transaction.updated',
        'ProjectTransaction',
        id,
        { projectId: item.projectId, changes: changedFields(before, item, Object.keys(input)) },
      );
      return item;
    });
    res.json({ data: { ...item, ...transactionPermissions(item, req.user!) } });
  });
  router.post('/:id/submit', requirePermission('transactions:write'), async (req, res) => {
    const id = idSchema.parse(req.params.id);
    z.object({}).strict().parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const before = await accessibleTransaction(tx, id, req.user!, true);
      assertRequester(before, req.user!);
      if (!['DRAFT', 'RETURNED_FOR_REVISION'].includes(before.status))
        conflict('Only Draft or Returned for Revision requests may be submitted.');
      const project = await accessibleProject(tx, before.projectId, req.user!);
      if (project.archivedAt) conflict('Restore the project before submitting requests.');
      const reviewers = await resolveReviewers(tx, project, before.requesterId);
      const attempt = (await tx.approvalWorkflow.count({ where: { transactionId: id } })) + 1;
      await tx.approvalWorkflow.create({
        data: {
          transactionId: id,
          attempt,
          requestSnapshot: JSON.parse(
            JSON.stringify({
              reference: before.reference,
              title: before.title,
              description: before.description,
              notes: before.notes,
              requestedAmount: before.requestedAmount,
              currency: before.currency,
              transactionDate: before.transactionDate,
              type: before.type.name,
              requesterId: before.requesterId,
              projectId: before.projectId,
            }),
          ) as Prisma.InputJsonValue,
          steps: {
            create: reviewers.map((assignedApproverId, index) => ({
              sequence: index + 1,
              assignedApproverId,
              state: index ? 'WAITING' : 'PENDING',
            })),
          },
        },
      });
      const item = await tx.projectTransaction.update({
        where: { id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
        include: transactionInclude,
      });
      await audit(tx, req.user!.id, 'transaction.submitted', 'ProjectTransaction', id, {
        projectId: project.id,
        attempt,
        reviewers,
      });
      return item;
    });
    res.json({ data: item });
  });
  router.post('/:id/cancel', async (req, res) => {
    const id = idSchema.parse(req.params.id),
      input = reasonSchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const before = await accessibleTransaction(tx, id, req.user!, true);
      if (isAdmin(req.user!) && before.expense && !before.expense.reversedBy)
        conflict('Reverse the posted expense before cancelling this transaction.');
      if (!transactionPermissions(before, req.user!).canCancel)
        throw new AppError(
          403,
          'FORBIDDEN',
          'This request cannot be cancelled by your account in its current state.',
        );
      const workflows = await tx.approvalWorkflow.findMany({
        where: { transactionId: id, status: 'ACTIVE' },
        select: { id: true },
      });
      await tx.approvalStep.updateMany({
        where: {
          workflowId: { in: workflows.map((w) => w.id) },
          state: { in: ['WAITING', 'PENDING'] },
        },
        data: { state: 'CANCELLED' },
      });
      await tx.approvalWorkflow.updateMany({
        where: { id: { in: workflows.map((w) => w.id) } },
        data: { status: 'CANCELLED' },
      });
      const item = await tx.projectTransaction.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: transactionInclude,
      });
      await audit(tx, req.user!.id, 'transaction.cancelled', 'ProjectTransaction', id, {
        projectId: item.projectId,
        before: before.status,
        comment: input.comment,
      });
      return item;
    });
    res.json({ data: item });
  });
  return router;
}
