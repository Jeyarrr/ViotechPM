import { z } from 'zod';

export const idSchema = z.uuid();
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(40)
  .regex(/^[A-Z0-9][A-Z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores.');
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
export const listSchema = z.object({
  q: z.string().trim().max(150).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['name', 'code', 'createdAt', 'updatedAt']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  archived: z.enum(['false', 'true']).default('false'),
});
export const clientSchema = z
  .object({
    code: codeSchema,
    name: z.string().trim().min(2).max(180),
    type: z.enum(['INDIVIDUAL', 'BUSINESS']),
    contactPerson: optionalText(150),
    email: z
      .union([z.email().max(254), z.literal(''), z.null()])
      .optional()
      .transform((v) => v?.toLowerCase() || null),
    phone: optionalText(50),
    address: optionalText(500),
    industry: optionalText(120),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    notes: optionalText(4000),
  })
  .strict();
export const clientListSchema = listSchema
  .extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() })
  .strict();
