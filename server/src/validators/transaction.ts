import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { idSchema, listSchema, optionalText } from './core.js';
import { dateSchema, optionalId } from './project.js';
export const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Use a positive amount with at most two decimal places.')
  .refine((v) => {
    try {
      return new Prisma.Decimal(v).greaterThan(0);
    } catch {
      return false;
    }
  }, 'Amount must be greater than zero.');
export const transactionStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED_FOR_REVISION',
  'CANCELLED',
]);
export const transactionSchema = z
  .object({
    projectId: idSchema,
    typeId: idSchema,
    title: z.string().trim().min(2).max(180),
    description: optionalText(4000),
    notes: optionalText(4000),
    requestedAmount: amountSchema,
    transactionDate: dateSchema,
  })
  .strict();
export const transactionListSchema = listSchema
  .omit({ archived: true })
  .extend({
    projectId: idSchema.optional(),
    typeId: idSchema.optional(),
    requesterId: idSchema.optional(),
    departmentId: idSchema.optional(),
    status: transactionStatusSchema.optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    sort: z
      .enum(['reference', 'title', 'transactionDate', 'requestedAmount', 'createdAt', 'updatedAt'])
      .default('createdAt'),
  })
  .strict()
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateTo >= q.dateFrom, {
    message: 'End date must be on or after the start date.',
    path: ['dateTo'],
  });
export const reasonSchema = z
  .object({
    comment: z.string().trim().min(3, 'Provide a reason of at least three characters.').max(2000),
  })
  .strict();
export const decisionSchema = z.object({ comment: optionalText(2000) }).strict();
export const policySchema = z
  .object({
    primaryReviewerId: optionalId,
    finalReviewerId: optionalId,
    requireSecondReview: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true'),
  })
  .strict();
export const approvalListSchema = listSchema
  .omit({ archived: true })
  .extend({
    projectId: idSchema.optional(),
    status: transactionStatusSchema.optional(),
    mine: z.enum(['true', 'false']).default('true'),
    sort: z.enum(['createdAt', 'submittedAt', 'transactionDate']).default('submittedAt'),
  })
  .strict();
