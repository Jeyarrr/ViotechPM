// Runs only on an explicitly supplied disposable Neon branch, never production.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { neonEnvironment } from './neon-run.mjs';
import { createDatabase } from '../server/dist/config/database.js';
import { bootstrap } from '../server/dist/services/bootstrap.service.js';
import request from 'supertest';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const direct = readFileSync('.local/neon-check-direct.txt', 'utf8')
  .replace(/^\uFEFF/, '')
  .trim();
const pooled = readFileSync('.local/neon-check-pool.txt', 'utf8')
  .replace(/^\uFEFF/, '')
  .trim();
const env = neonEnvironment();
assert.notEqual(new URL(direct).hostname, new URL(env.DIRECT_DATABASE_URL).hostname);
assert.ok(new URL(direct).hostname.endsWith('.neon.tech'));
execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
  cwd: 'server',
  windowsHide: true,
  stdio: 'pipe',
  env: { ...env, DATABASE_URL: pooled, DIRECT_DATABASE_URL: direct },
});
console.log('PASS: all migrations applied to isolated Neon branch.');
const db = createDatabase(pooled);
const email = `neon-smoke-${randomBytes(5).toString('hex')}@viotech.local`;
const password = randomBytes(30).toString('base64url');
await bootstrap(db, {
  BOOTSTRAP_ADMIN_NAME: 'Neon Smoke',
  BOOTSTRAP_ADMIN_EMAIL: email,
  BOOTSTRAP_ADMIN_PASSWORD: password,
});
const port = 4098;
const origin = 'http://127.0.0.1:5178';
const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: 'server',
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...env,
    NODE_ENV: 'test',
    DATABASE_URL: pooled,
    DIRECT_DATABASE_URL: direct,
    REALTIME_DATABASE_URL: direct,
    PORT: String(port),
    HOST: '127.0.0.1',
    CLIENT_ORIGIN: origin,
    SESSION_SECRET: randomBytes(48).toString('hex'),
  },
});
child.stdout.resume();
child.stderr.resume();
const exited = once(child, 'exit');
try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      ready = (await fetch(base + '/api/ready')).ok;
    } catch {
      /* starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'compiled server readiness');
  console.log('PASS: compiled API ready; pooled database and direct realtime listener connected.');
  const agent = request.agent(base);
  const csrf = async () => (await agent.get('/api/auth/csrf').expect(200)).body.data.csrfToken;
  const loginToken = await csrf();
  await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', loginToken)
    .send({ email, password })
    .expect(200);
  await agent.get('/api/auth/me').expect(200);
  console.log('PASS: CSRF login and persisted PostgreSQL session.');
  const token = await csrf();
  const write = (method, path) =>
    agent[method](path).type('json').set('Origin', origin).set('X-CSRF-Token', token);
  const created = await write('post', '/api/clients')
    .send({
      code: 'NEON-' + randomBytes(5).toString('hex'),
      name: 'Neon verification',
      type: 'BUSINESS',
      status: 'ACTIVE',
    })
    .expect(201);
  const id = created.body.data.id;
  await write('patch', '/api/clients/' + id)
    .send({ name: 'Neon verified' })
    .expect(200);
  assert.equal((await agent.get('/api/clients/' + id).expect(200)).body.data.name, 'Neon verified');
  assert.equal((await db.client.findUniqueOrThrow({ where: { id } })).name, 'Neon verified');
  await write('delete', '/api/clients/' + id)
    .send({})
    .expect(200);
  console.log('PASS: authenticated create/update/read/archive round trip persisted in Neon.');
  await write('post', '/api/auth/logout').send({}).expect(200);
  await agent.get('/api/auth/me').expect(401);
  console.log('PASS: logout revokes session.');
  const web = spawn(
    process.execPath,
    ['../node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5178'],
    {
      cwd: 'client',
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, VITE_PROXY_TARGET: base },
    },
  );
  const webExit = once(web, 'exit');
  let browser;
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch('http://127.0.0.1:5178')).ok) break;
      } catch {
        /* starting */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:5178/login');
    await page.getByLabel('Email or username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in to workspace' }).click();
    await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 30000 });
    await page.reload();
    await page.getByText('WORKSPACE OVERVIEW', { exact: false }).waitFor();
    console.log('PASS: browser login, dashboard rendering, and authenticated reload against Neon.');
  } finally {
    await browser?.close();
    web.kill();
    await webExit;
  }
} finally {
  child.kill();
  await exited;
  await db.$disconnect();
}
