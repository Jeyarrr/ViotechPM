import { z } from 'zod';
import { idSchema, listSchema } from './core.js';
import { dateSchema } from './project.js';
export const auditListSchema = listSchema
  .omit({ archived: true })
  .extend({
    projectId: idSchema.optional(),
    actorId: idSchema.optional(),
    action: z.string().trim().min(1).max(100).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    sort: z.enum(['timestamp', 'action']).default('timestamp'),
  })
  .strict()
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: 'End date must be on or after the start date.',
    path: ['dateTo'],
  });
