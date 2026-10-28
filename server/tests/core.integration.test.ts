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

async function projectInput(overrides: object = {}) {
  const client = await addClient();
  expect(client.status).toBe(201);
  const category = await db.projectCategory.findFirstOrThrow({ where: { active: true } });
  return {
    code: `PRJ-${randomBytes(5).toString('hex')}`,
    name: `Core project ${runId}`,
    clientId: client.body.data.id as string,
    categoryId: category.id,
    managerId: users.project_manager!,
    startDate: '2026-10-01',
    targetDate: '2026-12-31',
    budget: '12345.67',
    priority: 'HIGH',
    status: 'PLANNING',
    ...overrides,
  };
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
  await db.project.deleteMany({ where: { createdById: { in: ids } } });
  await db.projectCategory.deleteMany({ where: { name: { contains: runId } } });
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

describe('Project management on PostgreSQL', () => {
  it('persists decimal budgets, relationships, edits, and status audits', async () => {
    const input = await projectInput();
    const created = await write(admin, 'post', '/api/projects', input);
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data.budget).toBe('12345.67');
    expect(created.body.data.client.id).toBe(input.clientId);
    const changed = await write(admin, 'patch', `/api/projects/${id}`, {
      name: 'Updated project',
      budget: '999.99',
      status: 'ACTIVE',
    });
    expect(changed.status).toBe(200);
    expect((await db.project.findUniqueOrThrow({ where: { id } })).budget?.toFixed(2)).toBe(
      '999.99',
    );
    const detail = await admin.get(`/api/projects/${id}`).expect(200);
    expect(detail.body.data.progress).toBe(0);
    expect(detail.body.data.manager.id).toBe(users.project_manager);
    expect(detail.body.data.activity.map((row: { action: string }) => row.action)).toContain(
      'project.status_changed',
    );
  });
  it('rejects invalid budgets, dates, manager roles, missing relations, and premature completion', async () => {
    const input = await projectInput();
    expect((await write(admin, 'post', '/api/projects', { ...input, budget: '-1' })).status).toBe(
      422,
    );
    expect(
      (await write(admin, 'post', '/api/projects', { ...input, budget: '1.001' })).status,
    ).toBe(422);
    expect(
      (await write(admin, 'post', '/api/projects', { ...input, targetDate: '2026-09-01' })).status,
    ).toBe(422);
    expect(
      (await write(admin, 'post', '/api/projects', { ...input, startDate: '2026-02-30' })).status,
    ).toBe(422);
    expect(
      (await write(admin, 'post', '/api/projects', { ...input, managerId: users.employee })).status,
    ).toBe(409);
    expect(
      (await write(admin, 'post', '/api/projects', { ...input, status: 'COMPLETED' })).status,
    ).toBe(409);
    const created = await write(admin, 'post', '/api/projects', input);
    expect(created.status).toBe(201);
    expect((await write(admin, 'post', '/api/projects', input)).status).toBe(409);
    expect(
      (
        await write(admin, 'patch', `/api/projects/${created.body.data.id}`, {
          startDate: '2027-01-01',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await write(admin, 'patch', `/api/projects/${created.body.data.id}`, {
          actualCompletionDate: '2026-10-28',
        })
      ).status,
    ).toBe(422);
  });
  it('restricts project URLs and mutations to authorized projects', async () => {
    const input = await projectInput();
    const mine = await write(admin, 'post', '/api/projects', input);
    const other = await write(admin, 'post', '/api/projects', {
      ...input,
      code: `OTHER-${runId}`,
      managerId: adminId,
    });
    const manager = await login('project_manager');
    await manager.get(`/api/projects/${mine.body.data.id}`).expect(200);
    await manager.get(`/api/projects/${other.body.data.id}`).expect(404);
    expect(
      (await write(manager, 'patch', `/api/projects/${other.body.data.id}`, { name: 'Intrusion' }))
        .status,
    ).toBe(404);
    expect(
      (await write(manager, 'patch', `/api/projects/${mine.body.data.id}`, { managerId: adminId }))
        .status,
    ).toBe(403);
    const own = await write(manager, 'post', '/api/projects', { ...input, code: `OWN-${runId}` });
    expect(own.status).toBe(201);
    for (const role of ['employee', 'developer', 'it_support']) {
      const agent = await login(role);
      await agent.get(`/api/projects/${mine.body.data.id}`).expect(404);
      expect((await agent.get('/api/projects')).body.data.total).toBe(0);
      expect((await write(agent, 'post', '/api/projects', input)).status).toBe(403);
    }
    expect((await manager.get(`/api/projects?managerId=${adminId}`)).body.data.total).toBe(0);
  });
  it('filters and paginates projects and safely preserves archived client references', async () => {
    const input = await projectInput();
    const result = await write(admin, 'post', '/api/projects', input);
    const id = result.body.data.id as string;
    const list = await admin
      .get(
        `/api/projects?q=${input.code}&clientId=${input.clientId}&managerId=${input.managerId}&categoryId=${input.categoryId}&priority=HIGH&status=PLANNING&pageSize=1&sort=targetDate&direction=asc`,
      )
      .expect(200);
    expect(list.body.data.total).toBe(1);
    expect((await write(admin, 'delete', `/api/clients/${input.clientId}`)).status).toBe(200);
    expect((await admin.get(`/api/projects/${id}`)).body.data.client.id).toBe(input.clientId);
    expect(
      (await write(admin, 'post', '/api/projects', { ...input, code: `ARCHCLIENT-${runId}` }))
        .status,
    ).toBe(409);
    expect((await write(admin, 'delete', `/api/projects/${id}`)).status).toBe(200);
    expect((await admin.get(`/api/projects?q=${input.code}`)).body.data.total).toBe(0);
    expect((await admin.get(`/api/projects?q=${input.code}&archived=true`)).body.data.total).toBe(
      1,
    );
    expect(
      (await write(admin, 'patch', `/api/projects/${id}`, { name: 'Archived edit' })).status,
    ).toBe(409);
    expect((await write(admin, 'post', `/api/projects/${id}/restore`)).status).toBe(200);
    expect((await db.project.findUniqueOrThrow({ where: { id } })).clientId).toBe(input.clientId);
  });
  it('configures categories without deleting associations or allowing unauthorized changes', async () => {
    const created = await write(admin, 'post', '/api/project-categories', {
      name: `Category ${runId}`,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    const input = await projectInput({ categoryId: id });
    const project = await write(admin, 'post', '/api/projects', input);
    expect(project.status).toBe(201);
    expect(
      (await write(admin, 'patch', `/api/project-categories/${id}`, { active: false })).status,
    ).toBe(200);
    expect((await admin.get(`/api/projects/${project.body.data.id}`)).body.data.category.name).toBe(
      `Category ${runId}`,
    );
    expect(
      (await write(admin, 'post', '/api/projects', { ...input, code: `CAT-${runId}` })).status,
    ).toBe(409);
    const manager = await login('project_manager');
    expect(
      (await write(manager, 'post', '/api/project-categories', { name: 'Unauthorized category' }))
        .status,
    ).toBe(403);
    await manager.get('/api/lookups/roles').expect(403);
    await admin.get('/api/lookups/categories?pageSize=101').expect(422);
  });
});
