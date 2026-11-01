// Explicit opt-in to Neon. Normal development keeps server/.env unchanged.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';

export function neonEnvironment(path = '.env.local') {
  const local = parse(readFileSync('server/.env'));
  const hosted = parse(readFileSync(path));
  const direct = hosted.DATABASE_URL_UNPOOLED;
  if (!hosted.DATABASE_URL || !direct) throw Error('Run neon deploy to pull database variables.');
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
    const value = hosted[key];
    const url = new URL(value);
    if (!url.hostname.endsWith('.neon.tech') || !url.searchParams.has('sslmode'))
      throw Error('Expected a TLS Neon connection.');
    url.searchParams.set('sslmode', 'verify-full');
    hosted[key] = url.toString();
  }
  if (new URL(direct).hostname.includes('-pooler')) throw Error('A direct connection is required.');
  return {
    ...local,
    ...process.env,
    ...hosted,
    DIRECT_DATABASE_URL: hosted.DATABASE_URL_UNPOOLED,
    REALTIME_DATABASE_URL: hosted.DATABASE_URL_UNPOOLED,
    REMINDERS_ENABLED: 'false',
  };
}

if (process.argv[1]?.endsWith('neon-run.mjs')) {
  const task = process.argv[2];
  if (!['dev', 'db:migrate'].includes(task)) throw Error('Choose dev or db:migrate.');
  const child = spawn(process.execPath, [process.env.npm_execpath, 'run', task], {
    env: {
      ...neonEnvironment(),
      ...(task === 'dev' ? { NODE_ENV: 'development', HOST: '127.0.0.1' } : {}),
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
