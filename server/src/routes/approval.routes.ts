import { Router } from 'express';
import type { PrismaClient, Prisma, ApprovalOutcome } from '../generated/prisma/client.js';
import { requirePermission } from '../middleware/auth.js';
import { idSchema } from '../validators/core.js';
import {
  approvalListSchema,
  policySchema,
  decisionSchema,
  reasonSchema,
} from '../validators/transaction.js';
import { accessibleProject, isAdmin } from '../services/project.service.js';
import { canManageProject } from '../services/task.service.js';
import { audit, conflict, notFound, pageResult } from '../services/core.service.js';
import {
  accessibleTransaction,
  eligibleReviewer,
  transactionInclude,
  transactionScope,
  workflowInclude,
} from '../services/transaction.service.js';
import { AppError } from '../utils/errors.js';

export function approvalRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('approvals:read'));
  for (const pending of [true, false])
    router.get(pending ? '/pending' : '/', async (req, res) => {
      const q = approvalListSchema.parse(req.query),
        user = req.user!;
      const where: Prisma.ProjectTransactionWhereInput = {
        AND: [
          transactionScope(user),
          {
            projectId: q.projectId,
            status: q.status,
            OR: [
              { reference: { contains: q.q, mode: 'insensitive' } },
              { title: { contains: q.q, mode: 'insensitive' } },
            ],
            workflows: {
              some: {
                ...(pending ? { status: 'ACTIVE' as const } : {}),
                steps: {
                  some: {
                    ...(q.mine === 'true' ? { assignedApproverId: user.id } : {}),
                    ...(pending ? { state: 'PENDING' as const } : {}),
                  },
                },
              },
            },
          },
        ],
      };
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
      res.json({ data: pageResult(items, total, q.page, q.pageSize) });
    });
  router.get('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id),
      transaction = await accessibleTransaction(db, id, req.user!);
    const currentWorkflow = await db.approvalWorkflow.findFirst({
      where: { transactionId: id },
      orderBy: { attempt: 'desc' },
      include: workflowInclude,
    });
    res.json({ data: { ...transaction, currentWorkflow } });
  });
  for (const [path, outcome] of [
    ['approve', 'APPROVED'],
    ['reject', 'REJECTED'],
    ['return', 'RETURNED'],
  ] as const) {
    router.post(`/:id/${path}`, async (req, res) => {
      const id = idSchema.parse(req.params.id),
        input = (outcome === 'APPROVED' ? decisionSchema : reasonSchema).parse(req.body);
      let projectId: string | undefined;
      try {
        const result = await db.$transaction(async (tx) => {
          const transaction = await accessibleTransaction(tx, id, req.user!, true);
          projectId = transaction.projectId;
          if (transaction.requesterId === req.user!.id)
            throw new AppError(
              403,
              'SELF_APPROVAL_FORBIDDEN',
              'You cannot review your own transaction.',
            );
          if (!['SUBMITTED', 'UNDER_REVIEW'].includes(transaction.status))
            conflict('This transaction is not awaiting a decision.');
          if (transaction.project.archivedAt)
            conflict('Restore the project before reviewing transactions.');
          const workflow =
            (await tx.approvalWorkflow.findFirst({
              where: { transactionId: id, status: 'ACTIVE' },
              orderBy: { attempt: 'desc' },
              include: workflowInclude,
            })) ?? notFound();
          if (workflow.steps.some((step) => step.decision?.approverId === req.user!.id))
            conflict('Your decision for this submission has already been recorded.');
          const step = workflow.steps.find((step) => step.sequence === workflow.currentStage);
          if (!step || step.state !== 'PENDING')
            conflict('This approval stage is no longer pending.');
          if (
            step.assignedApproverId !== req.user!.id ||
            !(await eligibleReviewer(
              tx,
              req.user!.id,
              transaction.project.managerId,
              step.sequence,
            ))
          )
            throw new AppError(
              403,
              'FORBIDDEN',
              'Only the assigned eligible reviewer may decide this stage.',
            );
          await tx.approvalDecision.create({
            data: {
              stepId: step.id,
              approverId: req.user!.id,
              outcome: outcome as ApprovalOutcome,
              comment: input.comment,
            },
          });
          await tx.approvalStep.update({ where: { id: step.id }, data: { state: 'DECIDED' } });
          let status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
          if (outcome === 'APPROVED') {
            const next = workflow.steps.find((s) => s.sequence === step.sequence + 1);
            if (next) {
              await tx.approvalStep.update({ where: { id: next.id }, data: { state: 'PENDING' } });
              await tx.approvalWorkflow.update({
                where: { id: workflow.id },
                data: { currentStage: next.sequence },
              });
              status = 'UNDER_REVIEW';
            } else {
              await tx.approvalWorkflow.update({
                where: { id: workflow.id },
                data: { status: 'APPROVED' },
              });
              status = 'APPROVED';
            }
          } else {
            await tx.approvalStep.updateMany({
              where: { workflowId: workflow.id, state: 'WAITING' },
              data: { state: 'CANCELLED' },
            });
            await tx.approvalWorkflow.update({
              where: { id: workflow.id },
              data: { status: outcome },
            });
            status = outcome === 'REJECTED' ? 'REJECTED' : 'RETURNED_FOR_REVISION';
          }
          const item = await tx.projectTransaction.update({
            where: { id },
            data: {
              status,
              ...(status === 'APPROVED' ? { approvedAt: new Date() } : {}),
              ...(status === 'REJECTED' ? { rejectedAt: new Date() } : {}),
            },
            include: transactionInclude,
          });
          await audit(tx, req.user!.id, `approval.${path}`, 'ProjectTransaction', id, {
            projectId,
            workflowId: workflow.id,
            stepId: step.id,
            sequence: step.sequence,
            outcome,
            comment: input.comment,
          });
          await audit(tx, req.user!.id, 'transaction.status_changed', 'ProjectTransaction', id, {
            projectId,
            before: transaction.status,
            after: status,
          });
          return item;
        });
        res.json({ data: result });
      } catch (error) {
        if (error instanceof AppError && error.status === 403)
          await db.$transaction((tx) =>
            audit(tx, req.user!.id, 'workflow.access_denied', 'ProjectTransaction', id, {
              projectId,
              operation: path,
              reason: error.code,
            }),
          );
        throw error;
      }
    });
  }
  router.post('/:id/reassign', requirePermission('system:manage'), async (req, res) => {
    const id = idSchema.parse(req.params.id),
      input = reasonSchema.extend({ stepId: idSchema, approverId: idSchema }).parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const transaction = await accessibleTransaction(tx, id, req.user!, true);
      const step =
        (await tx.approvalStep.findFirst({
          where: {
            id: input.stepId,
            workflow: { transactionId: id, status: 'ACTIVE' },
            state: { in: ['WAITING', 'PENDING'] },
          },
        })) ?? notFound();
      if (
        input.approverId === transaction.requesterId ||
        !(await eligibleReviewer(
          tx,
          input.approverId,
          transaction.project.managerId,
          step.sequence,
        ))
      )
        conflict('Select an independent active reviewer eligible for this stage.');
      if (
        await tx.approvalStep.count({
          where: {
            workflowId: step.workflowId,
            id: { not: step.id },
            assignedApproverId: input.approverId,
          },
        })
      )
        conflict('Each stage must have a different reviewer.');
      const item = await tx.approvalStep.update({
        where: { id: step.id },
        data: { assignedApproverId: input.approverId },
      });
      await audit(tx, req.user!.id, 'approval.reassigned', 'ProjectTransaction', id, {
        projectId: transaction.projectId,
        stepId: step.id,
        before: step.assignedApproverId,
        after: input.approverId,
        comment: input.comment,
      });
      return item;
    });
    res.json({ data: item });
  });
  return router;
}

export function approvalPolicyRoutes(db: PrismaClient) {
  const router = Router({ mergeParams: true });
  router.get<{ id: string }>('/', async (req, res) => {
    const projectId = idSchema.parse(req.params.id),
      project = await accessibleProject(db, projectId, req.user!);
    if (!canManageProject(req.user!, project))
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only project management may view approval configuration.',
      );
    const policy = await db.approvalPolicy.findUnique({ where: { projectId } });
    const reviewers = isAdmin(req.user!)
      ? await db.user.findMany({
          where: {
            status: 'ACTIVE',
            OR: [
              { role: { key: 'super_admin' } },
              { id: project.managerId, role: { key: 'project_manager' } },
            ],
          },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, role: { select: { key: true, name: true } } },
        })
      : [];
    res.json({
      data: {
        primaryReviewerId: policy?.primaryReviewerId ?? '',
        finalReviewerId: policy?.finalReviewerId ?? '',
        requireSecondReview: policy?.requireSecondReview ?? true,
        reviewers,
      },
    });
  });
  router.patch<{ id: string }>('/', requirePermission('system:manage'), async (req, res) => {
    const projectId = idSchema.parse(req.params.id),
      input = policySchema.parse(req.body);
    const item = await db.$transaction(async (tx) => {
      const project = await accessibleProject(tx, projectId, req.user!, true);
      if (project.archivedAt)
        conflict('Restore the project before changing approval configuration.');
      if (
        input.primaryReviewerId &&
        !(await eligibleReviewer(tx, input.primaryReviewerId, project.managerId, 1))
      )
        conflict('Primary reviewer must be the current project manager or an active Super Admin.');
      if (
        input.finalReviewerId &&
        !(await eligibleReviewer(tx, input.finalReviewerId, project.managerId, 2))
      )
        conflict('Final reviewer must be an active Super Admin.');
      if (input.primaryReviewerId && input.primaryReviewerId === input.finalReviewerId)
        conflict('Primary and final reviewers must be different employees.');
      const before = await tx.approvalPolicy.findUnique({ where: { projectId } });
      const item = await tx.approvalPolicy.upsert({
        where: { projectId },
        create: { ...input, projectId, updatedById: req.user!.id },
        update: { ...input, updatedById: req.user!.id },
      });
      await audit(tx, req.user!.id, 'approval.policy_changed', 'Project', projectId, {
        before,
        after: input,
      });
      return item;
    });
    res.json({ data: item });
  });
  return router;
}
