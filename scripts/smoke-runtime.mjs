// Smoke the compiled entry point against the isolated test database only.
import { config } from 'dotenv';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
config({ path: 'server/.env', quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL)
  throw Error('Runtime smoke requires the separate test database.');
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: 'server',
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    DIRECT_DATABASE_URL: url,
    REALTIME_DATABASE_URL: url,
    PORT: String(port),
    HOST: '0.0.0.0',
    REMINDERS_ENABLED: 'false',
  },
});
let exited = false;
const exit = once(child, 'exit').then(([code, signal]) => {
  exited = true;
  return { code, signal };
});
child.stdout.resume();
child.stderr.resume();
let shutdownSucceeded = false;
try {
  let ready = false;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ready`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Startup may still be connecting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw Error('Compiled API did not become ready.');
  console.log('Compiled API binds the hosting interface and readiness returns 200.');
} finally {
  if (!exited) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (!exited) child.kill('SIGKILL');
  }, 22000);
  const result = await exit;
  clearTimeout(timer);
  shutdownSucceeded = process.platform === 'win32' || result.code === 0;
}
if (!shutdownSucceeded) throw Error('Graceful SIGTERM failed.');
console.log(
  process.platform === 'win32'
    ? 'Owned smoke process stopped; graceful signal semantics require Linux CI.'
    : 'Graceful SIGTERM completed successfully.',
);
