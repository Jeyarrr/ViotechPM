import { z } from 'zod';
import { codeSchema, idSchema, listSchema, optionalText } from './core.js';
export const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const projectStatusSchema = z.enum([
  'PLANNING',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
]);
export const dateSchema = z.iso.date().transform((v) => new Date(`${v}T00:00:00.000Z`));
export const optionalId = z
  .union([idSchema, z.literal(''), z.null()])
  .optional()
  .transform((v) => v || null);
export const projectSchema = z
  .object({
    code: codeSchema,
    name: z.string().trim().min(2).max(180),
    description: optionalText(4000),
    clientId: idSchema,
    categoryId: idSchema,
    managerId: idSchema,
    departmentId: optionalId,
    startDate: dateSchema,
    targetDate: dateSchema,
    budget: z
      .union([
        z
          .string()
          .regex(
            /^\d{1,12}(\.\d{1,2})?$/,
            'Use a non-negative amount with at most two decimal places.',
          ),
        z.literal(''),
        z.null(),
      ])
      .optional()
      .transform((v) => v || null),
    priority: prioritySchema,
    status: projectStatusSchema,
  })
  .strict();
export const projectListSchema = listSchema
  .extend({
    status: projectStatusSchema.optional(),
    priority: prioritySchema.optional(),
    clientId: idSchema.optional(),
    managerId: idSchema.optional(),
    categoryId: idSchema.optional(),
    sort: z
      .enum(['name', 'code', 'createdAt', 'updatedAt', 'targetDate', 'budget'])
      .default('createdAt'),
  })
  .strict();
export const categorySchema = z
  .object({ name: z.string().trim().min(2).max(120), active: z.boolean().default(true) })
  .strict();
