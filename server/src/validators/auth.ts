import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .transform((value) =>
        value === 'admin' && process.env.NODE_ENV === 'development'
          ? (process.env.BOOTSTRAP_ADMIN_EMAIL ?? value)
          : value,
      )
      .pipe(z.email().max(254)),
    password: z.string().min(1, 'Password is required').max(128),
  })
  .strict();

export const bootstrapSchema = z.object({
  BOOTSTRAP_ADMIN_NAME: z.string().trim().min(2).max(150),
  BOOTSTRAP_ADMIN_EMAIL: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  BOOTSTRAP_ADMIN_PASSWORD: z
    .string()
    .min(14)
    .max(128)
    .refine((v) => !v.includes('REPLACE')),
});
