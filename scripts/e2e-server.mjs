// Browser acceptance runs against the isolated test database, never the application database.
import { config } from 'dotenv';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
config({ path: 'server/.env', quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL)
  throw new Error('Browser tests require a separate _test database.');
const require = createRequire(import.meta.url);
const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_DATABASE_URL: url,
  NODE_ENV: 'test',
  PORT: '4001',
  CLIENT_ORIGIN: 'http://localhost:5174',
  TRUST_PROXY: '1',
};
const mode = process.argv[2];
const tsx = require.resolve('tsx/cli');
if (mode === 'api') {
  for (const args of [
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    [tsx, 'prisma/seed.ts'],
  ]) {
    try {
      execFileSync(process.execPath, args, {
        cwd: resolve('server'),
        env,
        windowsHide: true,
        stdio: 'pipe',
      });
    } catch {
      throw new Error(
        'Browser test database preparation failed. Check the local PostgreSQL service.',
      );
    }
  }
}
const child = spawn(
  process.execPath,
  mode === 'api'
    ? [tsx, 'src/index.ts']
    : [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5174'],
  {
    cwd: resolve(mode === 'api' ? 'server' : 'client'),
    env: { ...env, VITE_API_URL: '', VITE_PROXY_TARGET: 'http://localhost:4001' },
    windowsHide: true,
    stdio: 'inherit',
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
