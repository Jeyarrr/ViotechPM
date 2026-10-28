import { z } from 'zod';
import { codeSchema, idSchema, optionalText, listSchema } from './core.js';
import { dateSchema, optionalId, prioritySchema } from './project.js';
export const taskStatusSchema = z.enum([
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'COMPLETED',
  'BLOCKED',
]);
export const taskSchema = z
  .object({
    code: codeSchema,
    projectId: idSchema,
    title: z.string().trim().min(2).max(180),
    description: optionalText(4000),
    assigneeId: optionalId,
    priority: prioritySchema,
    status: taskStatusSchema,
    startDate: dateSchema,
    dueDate: dateSchema,
  })
  .strict();
export const taskListSchema = listSchema
  .extend({
    sort: z.enum(['title', 'code', 'createdAt', 'updatedAt', 'dueDate']).default('dueDate'),
    direction: z.enum(['asc', 'desc']).default('asc'),
    projectId: idSchema.optional(),
    assigneeId: idSchema.optional(),
    status: taskStatusSchema.optional(),
    priority: prioritySchema.optional(),
    mine: z.enum(['true', 'false']).default('false'),
    deadline: z.enum(['overdue', 'upcoming']).optional(),
  })
  .strict();
