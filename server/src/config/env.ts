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
  COOKIE_SAME_SITE: z.enum(['lax', 'none']).optional(),
  HOST: z.enum(['127.0.0.1', '0.0.0.0']).optional(),
  DIRECT_DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//)
    .optional(),
  REALTIME_DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//)
    .optional(),
  PRODUCTION_READY_ACK: z.enum(['true', 'false']).optional(),
  UPLOAD_STORAGE: z.enum(['local', 'durable-local']).optional(),
  UPLOAD_DIRECTORY: z.string().optional(),
  DOCUMENTS_ENABLED: z.enum(['true', 'false']).optional(),
  HOSTED_TEST_MODE: z.enum(['true', 'false']).optional(),
  TEST_ADMIN_EMAIL: z.email().optional(),
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
  const config = parsed.data;
  if (config.HOSTED_TEST_MODE === 'true' && !config.TEST_ADMIN_EMAIL)
    throw Error('HOSTED_TEST_MODE requires TEST_ADMIN_EMAIL for the admin alias.');
  if (config.COOKIE_SAME_SITE === 'none' && config.NODE_ENV !== 'production')
    throw Error('COOKIE_SAME_SITE=none requires production HTTPS.');
  if (config.NODE_ENV === 'production') {
    if (config.SESSION_SECRET.length < 48 || new Set(config.SESSION_SECRET).size < 16)
      throw Error('SESSION_SECRET must be a strong random production secret.');
    if (config.PRODUCTION_READY_ACK !== 'true')
      throw Error('PRODUCTION_READY_ACK must confirm the production checklist.');
    for (const [key, value] of [
      ['DATABASE_URL', config.DATABASE_URL],
      ['DIRECT_DATABASE_URL', config.DIRECT_DATABASE_URL],
      ['REALTIME_DATABASE_URL', config.REALTIME_DATABASE_URL ?? config.DIRECT_DATABASE_URL],
    ] as const) {
      let url: URL;
      try {
        url = new URL(value ?? '');
      } catch {
        throw Error(key + ' must be a valid production connection.');
      }
      if (
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '') ||
        (key !== 'DATABASE_URL' && url.hostname.includes('-pooler'))
      )
        throw Error(
          key + ' requires a remote TLS connection; listeners/migrations must use a direct host.',
        );
    }
    if (
      config.DOCUMENTS_ENABLED !== 'false' &&
      (config.UPLOAD_STORAGE !== 'durable-local' ||
        !config.UPLOAD_DIRECTORY ||
        !config.UPLOAD_DIRECTORY.startsWith('/'))
    )
      throw Error('Durable private document storage must be configured before production startup.');
  }
  return config;
}
