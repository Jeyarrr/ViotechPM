import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z
    .url()
    .refine((v) => new URL(v).origin === v, 'Use an origin without a trailing slash'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  SESSION_SECRET: z
    .string()
    .min(32)
    .refine((v) => !v.includes('REPLACE'), 'Set a random session secret'),
  TRUST_PROXY: z.enum(['0', '1']).default('0'),
});

export type AppConfig = z.infer<typeof schema>;

export function parseEnv(input: NodeJS.ProcessEnv): AppConfig {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    // Report variable names only; never echo environment values.
    throw new Error(
      `Invalid environment variables: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.CLIENT_ORIGIN.startsWith('https://')) {
    throw new Error('CLIENT_ORIGIN must use HTTPS in production');
  }
  return parsed.data;
}
