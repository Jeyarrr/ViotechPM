import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/services/bootstrap.service.js';
import { passwordOptions } from '../src/services/auth.service.js';
import type { AppConfig } from '../src/config/env.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (
  !testUrl ||
  !new URL(testUrl).pathname.endsWith('_test') ||
  testUrl === process.env.DATABASE_URL
)
  throw new Error('Core integration tests require a separate _test database.');
const db = createDatabase(testUrl);
const runId = randomBytes(6).toString('hex');
const password = randomBytes(24).toString('base64url');
const email = `core-admin-${runId}@test.viotech.local`;
const config: AppConfig = {
  NODE_ENV: 'test',
  PORT: 4000,
  CLIENT_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: testUrl,
  SESSION_SECRET: randomBytes(48).toString('hex'),
  TRUST_PROXY: '0',
};
let runtime: Awaited<ReturnType<typeof createApp>>;
let admin: ReturnType<typeof request.agent>;
let adminId: string;
const users: Record<string, string> = {};

async function write(
  agent: ReturnType<typeof request.agent>,
  method: 'post' | 'patch' | 'delete',
  path: string,
  body: object = {},
) {
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken as string;
  return agent[method](path)
    .set('Origin', config.CLIENT_ORIGIN)
    .set('X-CSRF-Token', token)
    .send(body);
}
async function login(role = 'super_admin') {
  const agent = request.agent(runtime.app);
  const response = await write(agent, 'post', '/api/auth/login', {
    email: role === 'super_admin' ? email : `core-${role}-${runId}@test.viotech.local`,
    password,
  });
  expect(response.status).toBe(200);
  return agent;
}
async function addClient(overrides: object = {}) {
  return write(admin, 'post', '/api/clients', {
    code: `CLI-${randomBytes(5).toString('hex')}`,
    name: `Core client ${runId}`,
    type: 'BUSINESS',
    status: 'ACTIVE',
    ...overrides,
  });
}

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  try {
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: testUrl, DIRECT_DATABASE_URL: testUrl },
        stdio: 'pipe',
        windowsHide: true,
      },
    );
  } catch {
    throw new Error('Unable to migrate the isolated test database.');
  }
  await bootstrap(db, {
    BOOTSTRAP_ADMIN_NAME: 'Core Admin',
    BOOTSTRAP_ADMIN_EMAIL: email,
    BOOTSTRAP_ADMIN_PASSWORD: password,
  });
  adminId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
  const hash = await argon2.hash(password, passwordOptions);
  for (const key of ['project_manager', 'developer', 'it_support', 'employee']) {
    const role = await db.role.findUniqueOrThrow({ where: { key } });
    users[key] = (
      await db.user.create({
        data: {
          name: `Core ${key}`,
          email: `core-${key}-${runId}@test.viotech.local`,
          passwordHash: hash,
          roleId: role.id,
        },
      })
    ).id;
  }
});
beforeEach(async () => {
  runtime = await createApp(config, db);
  admin = await login();
});
afterEach(async () => {
  if (runtime) await runtime.close();
});
afterAll(async () => {
  const ids = [adminId, ...Object.values(users)].filter(Boolean);
  await db.client.deleteMany({ where: { createdById: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe('Client management on PostgreSQL', () => {
  it('creates, reads, updates, persists, and audits client records', async () => {
    const created = await addClient({
      code: `lower-${runId}`,
      contactPerson: 'Initial contact',
      email: 'CLIENT@example.com',
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data.code).toBe(`LOWER-${runId.toUpperCase()}`);
    expect(created.body.data.email).toBe('client@example.com');
    const updated = await write(admin, 'patch', `/api/clients/${id}`, {
      contactPerson: 'Updated contact',
      status: 'INACTIVE',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.email).toBe('client@example.com');
    expect((await admin.get(`/api/clients/${id}`).expect(200)).body.data.contactPerson).toBe(
      'Updated contact',
    );
    expect((await db.client.findUniqueOrThrow({ where: { id } })).status).toBe('INACTIVE');
    const audits = await db.auditLog.findMany({
      where: { entityId: id },
      orderBy: { timestamp: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual(['client.created', 'client.updated']);
    expect(audits[1]!.metadata).toMatchObject({
      contactPerson: { before: 'Initial contact', after: 'Updated contact' },
    });
  });
  it('validates fields, duplicate normalized codes, paths, and pagination', async () => {
    const code = `DUP-${runId}`;
    expect((await addClient({ code })).status).toBe(201);
    expect((await addClient({ code: code.toLowerCase() })).status).toBe(409);
    expect((await addClient({ email: 'invalid' })).status).toBe(422);
    expect((await addClient({ name: '', createdById: users.employee })).status).toBe(422);
    await admin.get('/api/clients/not-a-uuid').expect(422);
    await admin.get('/api/clients?page=0').expect(422);
    await admin.get('/api/clients?pageSize=1000').expect(422);
    await admin.get('/api/clients?sort=passwordHash').expect(422);
  });
  it('searches, filters, sorts, and paginates at the database boundary', async () => {
    await addClient({
      name: `Alpha ${runId}`,
      contactPerson: `Contact ${runId}`,
      status: 'INACTIVE',
    });
    await addClient({ name: `Zulu ${runId}`, status: 'ACTIVE' });
    const result = await admin
      .get(`/api/clients?q=${runId}&sort=name&direction=asc&pageSize=1`)
      .expect(200);
    expect(result.body.data.items).toHaveLength(1);
    expect(result.body.data.items[0].name).toBe(`Alpha ${runId}`);
    expect(result.body.data.total).toBeGreaterThan(1);
    const filtered = await admin
      .get(`/api/clients?q=Contact%20${runId}&status=INACTIVE`)
      .expect(200);
    expect(filtered.body.data.items).toHaveLength(1);
    const next = await admin
      .get(`/api/clients?q=${runId}&page=2&pageSize=1&sort=name&direction=asc`)
      .expect(200);
    expect(next.body.data.items[0].id).not.toBe(result.body.data.items[0].id);
  });
  it('archives and restores without deleting the client or its history', async () => {
    const created = await addClient();
    const id = created.body.data.id as string;
    expect((await write(admin, 'delete', `/api/clients/${id}`)).status).toBe(200);
    expect((await db.client.findUniqueOrThrow({ where: { id } })).archivedAt).not.toBeNull();
    expect((await admin.get(`/api/clients?q=${created.body.data.code}`)).body.data.total).toBe(0);
    expect(
      (await admin.get(`/api/clients?q=${created.body.data.code}&archived=true`)).body.data.total,
    ).toBe(1);
    expect(
      (await write(admin, 'patch', `/api/clients/${id}`, { name: 'Forbidden edit' })).status,
    ).toBe(409);
    expect((await write(admin, 'post', `/api/clients/${id}/restore`)).status).toBe(200);
    expect((await db.client.findUniqueOrThrow({ where: { id } })).archivedAt).toBeNull();
    expect(await db.auditLog.count({ where: { entityId: id } })).toBe(3);
  });
  it('enforces authentication, write permissions, and direct-ID read authorization', async () => {
    const created = await addClient();
    await request(runtime.app).get('/api/clients').expect(401);
    const manager = await login('project_manager');
    await manager.get('/api/clients').expect(200);
    expect((await write(manager, 'delete', `/api/clients/${created.body.data.id}`)).status).toBe(
      403,
    );
    for (const role of ['employee', 'developer', 'it_support']) {
      const agent = await login(role);
      await agent.get('/api/clients').expect(403);
      await agent.get(`/api/clients/${created.body.data.id}`).expect(403);
      expect(
        (
          await write(agent, 'patch', `/api/clients/${created.body.data.id}`, {
            name: 'Unauthorized',
          })
        ).status,
      ).toBe(403);
    }
  });
});
