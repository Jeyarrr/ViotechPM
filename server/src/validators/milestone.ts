import { z } from 'zod';
import { idSchema, listSchema, optionalText } from './core.js';
import { dateSchema, optionalId, prioritySchema } from './project.js';
export const milestoneStatusSchema = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'IN_REVIEW',
  'COMPLETED',
  'DELAYED',
]);
export const milestoneSchema = z
  .object({
    projectId: idSchema,
    title: z.string().trim().min(2).max(180),
    description: optionalText(4000),
    responsibleId: optionalId,
    startDate: dateSchema,
    dueDate: dateSchema,
    status: milestoneStatusSchema,
    priority: prioritySchema,
    displayOrder: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();
export const milestoneListSchema = listSchema
  .extend({
    projectId: idSchema.optional(),
    responsibleId: idSchema.optional(),
    status: milestoneStatusSchema.optional(),
    priority: prioritySchema.optional(),
    overdue: z.enum(['true', 'false']).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    sort: z
      .enum(['title', 'dueDate', 'startDate', 'displayOrder', 'createdAt', 'updatedAt'])
      .default('displayOrder'),
    direction: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: 'End date must be on or after the start date.',
    path: ['dateTo'],
  });
