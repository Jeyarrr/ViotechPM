import { Router } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requirePermission } from '../middleware/auth.js';
import { idSchema, listSchema } from '../validators/core.js';
import { expenseSchema, expenseListSchema, reversalSchema } from '../validators/expense.js';
import {
  expenseWhere,
  expenseInclude,
  expenseSummary,
  financialProjectScope,
  assertFinancialActor,
  projectSpending,
  money,
} from '../services/expense.service.js';
import { accessibleTransaction } from '../services/transaction.service.js';
import { audit, conflict, notFound, pageResult } from '../services/core.service.js';
import { today } from '../services/task.service.js';
import { isAdmin } from '../services/project.service.js';
import { AppError } from '../utils/errors.js';

export function expenseRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('expenses:read'));
  router.get('/summary', async (req, res) => {
    const q = expenseListSchema.parse(req.query);
    const data = await db.$transaction((tx) => expenseSummary(tx, q, req.user!), {
      isolationLevel: 'RepeatableRead',
    });
    res.json({ data });
  });
  router.get('/options', async (req, res) => {
    const q = listSchema.strict().parse(req.query),
      scope = financialProjectScope(req.user!);
    const [projects, categories] = await db.$transaction([
      db.project.findMany({
        where: { AND: [scope, { name: { contains: q.q, mode: 'insensitive' } }] },
        select: {
          id: true,
          name: true,
          code: true,
          archivedAt: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.expense.groupBy({
        by: ['category'],
        where: { project: scope },
        orderBy: { category: 'asc' },
      }),
    ]);
    const total = await db.project.count({
      where: { AND: [scope, { name: { contains: q.q, mode: 'insensitive' } }] },
    });
    res.json({
      data: {
        projects: pageResult(projects, total, q.page, q.pageSize),
        categories: categories.map((r) => r.category),
      },
    });
  });
  router.get('/postable', async (req, res) => {
    const q = listSchema.extend({ projectId: idSchema.optional() }).strict().parse(req.query);
    const where = {
      status: 'APPROVED' as const,
      expense: { is: null },
      projectId: q.projectId,
      project: { AND: [financialProjectScope(req.user!), { archivedAt: null }] },
      OR: [
        { reference: { contains: q.q, mode: 'insensitive' as const } },
        { title: { contains: q.q, mode: 'insensitive' as const } },
      ],
    };
    const [items, total] = await db.$transaction([
      db.projectTransaction.findMany({
        where,
        select: {
          id: true,
          reference: true,
          title: true,
          requestedAmount: true,
          project: { select: { name: true } },
        },
        orderBy: [{ approvedAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.projectTransaction.count({ where }),
    ]);
    res.json({ data: pageResult(items, total, q.page, q.pageSize) });
  });
  router.get('/', async (req, res) => {
    const q = expenseListSchema.parse(req.query),
      where = expenseWhere(q, req.user!);
    const [items, total] = await db.$transaction([
      db.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ [q.sort]: q.direction }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.expense.count({ where }),
    ]);
    res.json({
      data: pageResult(
        items.map((item) => ({
          ...item,
          canReverse: isAdmin(req.user!) && item.kind === 'POSTING' && !item.reversedBy,
        })),
        total,
        q.page,
        q.pageSize,
      ),
    });
  });
  router.get('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id),
      item =
        (await db.expense.findFirst({
          where: { id, project: financialProjectScope(req.user!) },
          include: expenseInclude,
        })) ?? notFound();
    res.json({
      data: {
        ...item,
        canReverse: isAdmin(req.user!) && item.kind === 'POSTING' && !item.reversedBy,
      },
    });
  });
  router.post('/', async (req, res) => {
    const input = expenseSchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const transaction = await accessibleTransaction(tx, input.transactionId, req.user!, true);
      await assertFinancialActor(tx, req.user!.id, transaction.project.managerId);
      if (transaction.project.archivedAt) conflict('Restore the project before posting expenses.');
      if (transaction.status !== 'APPROVED')
        conflict('Only an approved request may be posted as an expense.');
      if (await tx.expense.findUnique({ where: { transactionId: transaction.id } }))
        conflict('This request has already been posted.');
      const workflow = await tx.approvalWorkflow.findFirst({
        where: { transactionId: transaction.id },
        orderBy: { attempt: 'desc' },
        include: { steps: { include: { decision: true } } },
      });
      const snapshot = workflow?.requestSnapshot as
        { requestedAmount?: string; type?: string } | undefined;
      if (
        workflow?.status !== 'APPROVED' ||
        !workflow.steps.length ||
        workflow.steps.some(
          (s) =>
            s.state !== 'DECIDED' ||
            s.decision?.outcome !== 'APPROVED' ||
            s.decision.approverId === transaction.requesterId,
        ) ||
        !snapshot?.requestedAmount ||
        !money(snapshot.requestedAmount).equals(transaction.requestedAmount)
      )
        conflict('A completed matching approval history is required for expense posting.');
      const project = await tx.project.findUniqueOrThrow({ where: { id: transaction.projectId } });
      if (!project.budget || !money(project.budget).greaterThan(0))
        conflict('Set a positive project budget before posting expenses.');
      if (
        (await projectSpending(tx, project.id))
          .plus(transaction.requestedAmount)
          .greaterThan(project.budget)
      )
        conflict(
          'Posting would exceed the authorized project budget. Increase the budget before posting.',
        );
      const expenseDate = input.expenseDate ?? transaction.transactionDate;
      if (expenseDate > today())
        throw new AppError(422, 'INVALID_DATE', 'An expense cannot be posted with a future date.');
      const item = await tx.expense.create({
        data: {
          projectId: project.id,
          transactionId: transaction.id,
          category: snapshot.type ?? transaction.type.name,
          description: transaction.title,
          amount: transaction.requestedAmount,
          expenseDate,
          kind: 'POSTING',
          recordedById: req.user!.id,
        },
        include: expenseInclude,
      });
      await audit(tx, req.user!.id, 'expense.posted', 'Expense', item.id, {
        projectId: project.id,
        transactionId: transaction.id,
        amount: item.amount.toFixed(2),
        category: item.category,
      });
      await audit(
        tx,
        req.user!.id,
        'transaction.expense_posted',
        'ProjectTransaction',
        transaction.id,
        { projectId: project.id, expenseId: item.id, amount: item.amount.toFixed(2) },
      );
      return item;
    });
    res.status(201).json({ data: item });
  });
  router.post('/:id/reverse', requirePermission('system:manage'), async (req, res) => {
    const id = idSchema.parse(req.params.id),
      input = reversalSchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const found = (await tx.expense.findUnique({ where: { id } })) ?? notFound();
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${found.projectId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id}::uuid FOR UPDATE`;
      const before = await tx.expense.findUniqueOrThrow({ where: { id }, include: expenseInclude });
      await assertFinancialActor(tx, req.user!.id, before.project.managerId, true);
      if (before.kind !== 'POSTING' || before.reversedBy)
        conflict('Only an unreversed original expense can be reversed.');
      const expenseDate = input.expenseDate ?? today();
      if (expenseDate < before.expenseDate || expenseDate > today())
        throw new AppError(
          422,
          'INVALID_DATE',
          'Reversal date must be between the original expense date and today.',
        );
      const item = await tx.expense.create({
        data: {
          projectId: before.projectId,
          category: before.category,
          description: before.description,
          amount: money(before.amount).negated(),
          expenseDate,
          kind: 'REVERSAL',
          recordedById: req.user!.id,
          reversalOfId: id,
          reversalReason: input.comment,
        },
        include: expenseInclude,
      });
      await audit(tx, req.user!.id, 'expense.reversed', 'Expense', item.id, {
        projectId: before.projectId,
        reversalOfId: id,
        amount: item.amount.toFixed(2),
        comment: input.comment,
      });
      if (before.transactionId)
        await audit(
          tx,
          req.user!.id,
          'transaction.expense_reversed',
          'ProjectTransaction',
          before.transactionId,
          {
            projectId: before.projectId,
            expenseId: id,
            reversalId: item.id,
            comment: input.comment,
          },
        );
      return item;
    });
    res.status(201).json({ data: item });
  });
  return router;
}
