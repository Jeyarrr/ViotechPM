import fs from 'node:fs';
import { parse } from 'dotenv';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createDatabase } from '../server/dist/config/database.js';
import { createApp } from '../server/dist/app.js';
import { parseEnv } from '../server/dist/config/env.js';
import { createAuthService } from '../server/dist/services/auth.service.js';
const env = parse(fs.readFileSync('server/.env'));
const target = new URL(env.DATABASE_URL);
if (
  env.NODE_ENV !== 'development' ||
  target.hostname !== '127.0.0.1' ||
  target.port !== '55432' ||
  target.pathname !== '/viotechpm'
)
  throw Error('Local isolated demo database required.');
Object.assign(process.env, {
  NODE_ENV: 'development',
  BOOTSTRAP_ADMIN_EMAIL: env.BOOTSTRAP_ADMIN_EMAIL,
});
const origin = 'http://localhost:5178';
const db = createDatabase(env.DATABASE_URL);
const runtime = await createApp(
  parseEnv({
    ...env,
    NODE_ENV: 'development',
    CLIENT_ORIGIN: origin,
    PORT: '4002',
    HOST: '127.0.0.1',
    DOCUMENTS_ENABLED: 'true',
  }),
  db,
);
await new Promise((r) => runtime.server.listen(4002, '127.0.0.1', r));
const web = spawn(
  process.execPath,
  ['../node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5178'],
  {
    cwd: 'client',
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_API_URL: '', VITE_PROXY_TARGET: 'http://127.0.0.1:4002' },
  },
);
let browser;
const accounts = [
  ['admin', 'admin', 'super_admin'],
  ['manager@viotech.test', 'Manager@VioPM2026!', 'project_manager'],
  ['developer@viotech.test', 'Developer@VioPM2026!', 'developer'],
  ['technician@viotech.test', 'Technician@VioPM2026!', 'it_support'],
  ['employee@viotech.test', 'Employee@VioPM2026!', 'employee'],
];
const id = (n) => `7e48c2a1-d9a7-4d76-8901-${String(n).padStart(12, '0')}`;
try {
  const productionAuth = await createAuthService(db, true);
  for (const [email, password] of accounts) {
    const identifier = email === 'admin' ? env.BOOTSTRAP_ADMIN_EMAIL : email;
    await assert.rejects(productionAuth.authenticate(identifier, password), { status: 401 });
    const user = await db.user.findUniqueOrThrow({ where: { email: identifier } });
    assert.equal(await productionAuth.currentUser(user.id), null);
  }
  console.log(
    'PASS: all five local demo credentials and their existing sessions are rejected by production authentication.',
  );
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      // The isolated Vite process may still be starting.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch();
  const pages = [];
  for (const [email, password, role] of accounts) {
    const context = await browser.newContext(),
      page = await context.newPage();
    pages.push(page);
    await page.goto(origin + '/login');
    await page.getByLabel('Email or username').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in to workspace' }).click();
    await page.waitForURL(origin + '/');
    await page.reload();
    const me = await (await page.request.get(origin + '/api/auth/me')).json();
    assert.equal(me.data.user.role.key, role);
    assert.equal(
      (await page.request.get(origin + '/api/system/access')).status(),
      role === 'super_admin' ? 200 : 403,
    );
    if (!['super_admin', 'project_manager'].includes(role))
      assert.equal((await page.request.get(origin + '/api/employees')).status(), 403);
    console.log(`PASS: ${role} browser login, reload and administrative authorization.`);
  }
  const write = async (page, path, body = {}, method = 'POST', expected = 200) => {
    const csrf = (await (await page.request.get(origin + '/api/auth/csrf')).json()).data.csrfToken;
    const r = await page.request.fetch(origin + '/api' + path, {
      method,
      headers: { Origin: origin, 'X-CSRF-Token': csrf },
      data: body,
    });
    const json = await r.json();
    assert.equal(r.status(), expected, JSON.stringify(json));
    return json.data;
  };
  const [admin, manager, developer, technician, employee] = pages;
  await write(developer, `/tasks/${id(21)}/status`, { status: 'IN_PROGRESS' }, 'PATCH');
  await write(technician, `/tasks/${id(22)}/status`, { status: 'IN_PROGRESS' }, 'PATCH');
  await write(employee, `/tasks/${id(23)}/status`, { status: 'IN_PROGRESS' }, 'PATCH');
  await write(developer, `/tasks/${id(21)}`, { assigneeId: id(3) }, 'PATCH', 403);
  await write(manager, `/tasks/${id(21)}`, { assigneeId: id(3) }, 'PATCH');
  await write(manager, `/tasks/${id(21)}`, { assigneeId: id(2) }, 'PATCH');
  assert.ok((await db.notification.count({ where: { recipientId: id(2), taskId: id(21) } })) > 0);
  console.log(
    'PASS: manager assignments, worker status updates, denied unauthorized reassignment, persisted notifications.',
  );
  await manager.goto(origin + `/tasks/${id(21)}`);
  await developer.goto(origin + `/tasks/${id(21)}`);
  await developer.getByRole('heading', { name: 'Discussion', exact: true }).waitFor();
  const message = 'Fictional collaboration check ' + Date.now();
  await manager.getByLabel('New comment', { exact: true }).fill(message);
  await manager.getByRole('button', { name: 'Post comment' }).click();
  await developer.getByText(message, { exact: true }).waitFor({ timeout: 15000 });
  await manager.goto(origin + `/projects/${id(11)}`);
  await manager.getByRole('heading', { name: 'Project activity', exact: true }).waitFor();
  await manager.getByLabel('Activity type').selectOption('comment');
  await manager.getByRole('link', { name: 'comment created', exact: true }).first().waitFor();
  console.log(
    'PASS: separate simultaneous browser sessions, realtime discussion and project activity timeline.',
  );
  const type = await db.transactionType.findFirstOrThrow();
  const transaction = await write(
    employee,
    '/transactions',
    {
      projectId: id(11),
      typeId: type.id,
      title: 'Fictional local demo request',
      requestedAmount: '100.00',
      transactionDate: '2026-11-02',
    },
    'POST',
    201,
  );
  await write(employee, `/transactions/${transaction.id}/submit`);
  await write(employee, `/approvals/${transaction.id}/approve`, {}, 'POST', 403);
  await write(manager, `/approvals/${transaction.id}/approve`);
  await write(admin, `/approvals/${transaction.id}/approve`);
  assert.equal(
    (await db.projectTransaction.findUniqueOrThrow({ where: { id: transaction.id } })).status,
    'APPROVED',
  );
  console.log(
    'PASS: employee request, denied self-approval, manager review and final Super Admin approval.',
  );
} finally {
  await browser?.close();
  web.kill();
  await runtime.close();
  await db.$disconnect();
}
