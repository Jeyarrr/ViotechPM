import { z } from 'zod';
import { idSchema, listSchema } from './core.js';
import { dateSchema } from './project.js';
import { reasonSchema } from './transaction.js';
export const expenseSchema = z
  .object({ transactionId: idSchema, expenseDate: dateSchema.optional() })
  .strict();
export const reversalSchema = reasonSchema.extend({ expenseDate: dateSchema.optional() });
export const expenseListSchema = listSchema
  .omit({ archived: true })
  .extend({
    projectId: idSchema.optional(),
    clientId: idSchema.optional(),
    category: z.string().trim().max(100).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    projectState: z.enum(['all', 'current', 'archived']).default('all'),
    sort: z.enum(['expenseDate', 'createdAt', 'amount', 'category']).default('expenseDate'),
    projectPage: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateTo >= q.dateFrom, {
    message: 'End date must be on or after start date.',
    path: ['dateTo'],
  });
