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
  await db.task.deleteMany({ where: { project: { createdById: { in: ids } } } });
  await db.milestone.deleteMany({ where: { project: { createdById: { in: ids } } } });
  await db.projectMember.deleteMany({ where: { project: { createdById: { in: ids } } } });
  await db.project.deleteMany({ where: { createdById: { in: ids } } });
  await db.projectCategory.deleteMany({ where: { name: { contains: runId } } });
  await db.client.deleteMany({ where: { createdById: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe('Milestones on PostgreSQL', () => {
  async function fixture(member = users.developer!) {
    const project = await write(admin, 'post', '/api/projects', await projectInput());
    expect(project.status).toBe(201);
    const projectId = project.body.data.id as string;
    expect(
      (await write(admin, 'post', `/api/projects/${projectId}/members`, { userId: member })).status,
    ).toBe(201);
    const input = {
      projectId,
      title: `Milestone ${runId}`,
      description: 'Deliverable',
      responsibleId: member,
      startDate: '2026-10-01',
      dueDate: '2026-10-20',
      status: 'NOT_STARTED',
      priority: 'HIGH',
      displayOrder: 2,
    };
    const created = await write(admin, 'post', '/api/milestones', input);
    expect(created.status).toBe(201);
    return { projectId, id: created.body.data.id as string, input };
  }
  it('creates, edits, manually completes empty milestones, archives/restores, and records history', async () => {
    const { id } = await fixture();
    const before = await db.milestone.findUniqueOrThrow({ where: { id } });
    const detail = (await admin.get(`/api/milestones/${id}`)).body.data;
    expect(detail.progress).toBe(0);
    expect(detail.overdue).toBe(true);
    expect((await db.milestone.findUniqueOrThrow({ where: { id } })).updatedAt).toEqual(
      before.updatedAt,
    );
    const done = await write(admin, 'patch', `/api/milestones/${id}`, {
      status: 'COMPLETED',
      title: 'Ready for delivery',
    });
    expect(done.status).toBe(200);
    expect(done.body.data.completedAt).toBeTruthy();
    expect(done.body.data.progress).toBe(100);
    expect(
      (await write(admin, 'patch', `/api/milestones/${id}`, { description: 'Updated description' }))
        .body.data.completedAt,
    ).toBe(done.body.data.completedAt);
    expect((await write(admin, 'delete', `/api/milestones/${id}`)).status).toBe(200);
    expect(
      (await write(admin, 'patch', `/api/milestones/${id}`, { title: 'Cannot edit' })).status,
    ).toBe(409);
    expect((await write(admin, 'post', `/api/milestones/${id}/restore`)).status).toBe(200);
    const logs = await db.auditLog.findMany({ where: { entityType: 'Milestone', entityId: id } });
    expect(logs.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        'milestone.created',
        'milestone.updated',
        'milestone.completed',
        'milestone.archived',
        'milestone.restored',
      ]),
    );
  });
  it('links only same-project tasks, blocks incomplete completion, and reconciles reopening', async () => {
    const { id, projectId } = await fixture();
    const input = {
      code: `MTSK-${runId}`,
      projectId,
      milestoneId: id,
      title: 'Milestone task',
      assigneeId: users.developer,
      priority: 'MEDIUM',
      status: 'TODO',
      startDate: '2026-10-01',
      dueDate: '2026-10-20',
    };
    const task = await write(admin, 'post', '/api/tasks', input);
    expect(task.status).toBe(201);
    const taskId = task.body.data.id as string;
    expect(
      (await write(admin, 'patch', `/api/milestones/${id}`, { status: 'COMPLETED' })).status,
    ).toBe(409);
    expect(
      (await write(admin, 'patch', `/api/tasks/${taskId}/status`, { status: 'COMPLETED' })).status,
    ).toBe(200);
    expect((await admin.get(`/api/milestones/${id}`)).body.data.progress).toBe(100);
    expect(
      (await write(admin, 'patch', `/api/milestones/${id}`, { status: 'COMPLETED' })).status,
    ).toBe(200);
    expect(
      (await write(admin, 'patch', `/api/projects/${projectId}`, { status: 'COMPLETED' })).status,
    ).toBe(200);
    const developer = await login('developer');
    expect(
      (await write(developer, 'patch', `/api/tasks/${taskId}/status`, { status: 'IN_PROGRESS' }))
        .status,
    ).toBe(200);
    expect((await admin.get(`/api/milestones/${id}`)).body.data).toMatchObject({
      status: 'IN_PROGRESS',
      completedAt: null,
      progress: 0,
    });
    expect((await admin.get(`/api/projects/${projectId}`)).body.data).toMatchObject({
      status: 'ACTIVE',
      actualCompletionDate: null,
    });
    const other = await fixture(users.employee!);
    expect(
      (
        await write(admin, 'post', '/api/tasks', {
          ...input,
          code: `CROSS-${runId}`,
          projectId: other.projectId,
        })
      ).status,
    ).toBe(409);
    expect(
      (await write(admin, 'patch', `/api/tasks/${taskId}`, { milestoneId: other.id })).status,
    ).toBe(409);
    expect((await admin.get(`/api/tasks?milestoneId=${id}`)).body.data.total).toBe(1);
    expect((await write(admin, 'delete', `/api/milestones/${id}`)).status).toBe(200);
    expect((await db.task.findUniqueOrThrow({ where: { id: taskId } })).milestoneId).toBe(id);
    expect(
      (await write(admin, 'post', '/api/tasks', { ...input, code: `ARCH-${runId}` })).status,
    ).toBe(409);
    expect((await write(admin, 'post', `/api/milestones/${id}/restore`)).status).toBe(200);
    expect(
      (await write(admin, 'patch', `/api/tasks/${taskId}`, { milestoneId: null })).status,
    ).toBe(200);
    expect((await db.task.findUniqueOrThrow({ where: { id: taskId } })).milestoneId).toBeNull();
  });
  it('enforces responsible-member permissions and safe member/account changes', async () => {
    const { id, projectId, input } = await fixture();
    const developer = await login('developer'),
      outsider = await login('it_support');
    await developer.get(`/api/milestones/${id}`).expect(200);
    await outsider.get(`/api/milestones/${id}`).expect(404);
    expect(
      (await write(outsider, 'patch', `/api/milestones/${id}`, { status: 'IN_PROGRESS' })).status,
    ).toBe(404);
    expect(
      (await write(developer, 'patch', `/api/milestones/${id}`, { status: 'IN_PROGRESS' })).status,
    ).toBe(200);
    expect(
      (await write(developer, 'patch', `/api/milestones/${id}`, { status: 'COMPLETED' })).status,
    ).toBe(403);
    expect(
      (await write(developer, 'patch', `/api/milestones/${id}`, { title: 'Forbidden edit' }))
        .status,
    ).toBe(422);
    expect((await write(developer, 'post', '/api/milestones', input)).status).toBe(403);
    expect(
      (await write(admin, 'delete', `/api/projects/${projectId}/members/${users.developer}`))
        .status,
    ).toBe(409);
    expect(
      (
        await write(admin, 'patch', `/api/employees/${users.developer}/status`, {
          status: 'INACTIVE',
        })
      ).status,
    ).toBe(409);
    expect(
      (await write(admin, 'patch', `/api/milestones/${id}`, { responsibleId: users.it_support }))
        .status,
    ).toBe(409);
    expect(
      (await write(admin, 'patch', `/api/milestones/${id}`, { responsibleId: null })).status,
    ).toBe(200);
    expect(
      (await write(admin, 'delete', `/api/projects/${projectId}/members/${users.developer}`))
        .status,
    ).toBe(200);
    await developer.get(`/api/milestones/${id}`).expect(404);
  });
  it('validates dates and fields, searches, filters, paginates, and protects archived projects', async () => {
    const { id, projectId, input } = await fixture(users.employee!);
    const employee = await login('employee');
    await employee.get(`/api/milestones/${id}`).expect(200);
    expect(
      (await write(employee, 'patch', `/api/milestones/${id}`, { status: 'IN_PROGRESS' })).status,
    ).toBe(403);
    expect(
      (await write(admin, 'post', '/api/milestones', { ...input, dueDate: '2026-09-01' })).status,
    ).toBe(422);
    expect(
      (await write(admin, 'patch', `/api/milestones/${id}`, { completedAt: '2026-10-02' })).status,
    ).toBe(422);
    expect(
      (
        await write(admin, 'post', '/api/milestones', {
          ...input,
          title: 'Second deliverable',
          displayOrder: 1,
        })
      ).status,
    ).toBe(201);
    const list = (await admin.get(`/api/milestones?projectId=${projectId}&pageSize=1`)).body.data;
    expect(list.total).toBe(2);
    expect(list.pages).toBe(2);
    expect(list.items[0].title).toBe('Second deliverable');
    expect(
      (
        await admin.get(
          `/api/milestones?projectId=${projectId}&q=Second&priority=HIGH&status=NOT_STARTED&overdue=true`,
        )
      ).body.data.total,
    ).toBe(1);
    expect((await write(admin, 'delete', `/api/projects/${projectId}`)).status).toBe(200);
    expect(
      (await write(admin, 'patch', `/api/milestones/${id}`, { status: 'COMPLETED' })).status,
    ).toBe(409);
    expect((await admin.get(`/api/milestones?projectId=${projectId}`)).body.data.total).toBe(0);
    expect((await write(admin, 'post', `/api/projects/${projectId}/restore`)).status).toBe(200);
  });
});

describe('Team and tasks on PostgreSQL', () => {
  async function setupTask(assignee = users.developer!) {
    const project = await write(admin, 'post', '/api/projects', await projectInput());
    expect(project.status).toBe(201);
    const projectId = project.body.data.id as string;
    expect(
      (
        await write(admin, 'post', `/api/projects/${projectId}/members`, {
          userId: assignee,
          role: 'Delivery',
        })
      ).status,
    ).toBe(201);
    const input = {
      code: `TSK-${randomBytes(5).toString('hex')}`,
      projectId,
      title: `Task ${runId}`,
      assigneeId: assignee,
      priority: 'HIGH',
      status: 'TODO',
      startDate: '2026-10-01',
      dueDate: '2026-10-30',
    };
    const task = await write(admin, 'post', '/api/tasks', input);
    expect(task.status).toBe(201);
    return { projectId, id: task.body.data.id as string, input };
  }
  it('creates secure employee accounts, edits profiles, rejects escalation, and revokes deactivated sessions', async () => {
    const role = await db.role.findUniqueOrThrow({ where: { key: 'employee' } });
    const newEmail = `new-${runId}@test.viotech.local`;
    const created = await write(admin, 'post', '/api/employees', {
      name: 'New Employee',
      email: newEmail.toUpperCase(),
      password,
      roleId: role.id,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    users.new = id;
    expect(created.body.data).not.toHaveProperty('passwordHash');
    expect(
      await argon2.verify(
        (await db.user.findUniqueOrThrow({ where: { id } })).passwordHash,
        password,
      ),
    ).toBe(true);
    expect(
      (await write(admin, 'patch', `/api/employees/${id}`, { name: 'Updated Employee' })).status,
    ).toBe(200);
    expect((await admin.get(`/api/employees/${id}`)).body.data.email).toBe(newEmail);
    expect(
      (await write(admin, 'patch', `/api/employees/${id}`, { passwordHash: 'unsafe' })).status,
    ).toBe(422);
    expect(
      (
        await write(admin, 'post', '/api/employees', {
          name: 'Duplicate',
          email: newEmail,
          password,
          roleId: role.id,
        })
      ).status,
    ).toBe(409);
    const employee = request.agent(runtime.app);
    expect(
      (await write(employee, 'post', '/api/auth/login', { email: newEmail, password })).status,
    ).toBe(200);
    expect(
      (
        await write(employee, 'patch', `/api/employees/${id}`, {
          roleId: (await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } })).id,
        })
      ).status,
    ).toBe(403);
    const manager = await login('project_manager');
    await manager.get('/api/employees').expect(200);
    expect(
      (
        await write(manager, 'post', '/api/employees', {
          name: 'Denied',
          email: 'denied@test.local',
          password,
          roleId: role.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (await write(admin, 'patch', `/api/employees/${id}/status`, { status: 'INACTIVE' })).status,
    ).toBe(200);
    await employee.get('/api/auth/me').expect(401);
    expect(await db.session.count({ where: { sess: { path: ['userId'], equals: id } } })).toBe(0);
    expect(
      (await write(admin, 'patch', `/api/employees/${id}/status`, { status: 'ACTIVE' })).status,
    ).toBe(200);
    expect(
      (await db.auditLog.findMany({ where: { entityType: 'User', entityId: id } })).every(
        (r) => !JSON.stringify(r.metadata).includes(password),
      ),
    ).toBe(true);
  });
  it('protects the last active administrator against concurrent status and role changes', async () => {
    const others = await db.user.findMany({
      where: { id: { not: adminId }, status: 'ACTIVE', role: { key: 'super_admin' } },
      select: { id: true },
    });
    const role = await db.role.findUniqueOrThrow({ where: { key: 'employee' } });
    try {
      // Only isolated test fixtures; restore their exact active state in finally.
      await db.user.updateMany({
        where: { id: { in: others.map((r) => r.id) } },
        data: { status: 'INACTIVE' },
      });
      const token = (await admin.get('/api/auth/csrf')).body.data.csrfToken as string;
      const results = await Promise.all([
        admin
          .patch(`/api/employees/${adminId}/status`)
          .set('Origin', config.CLIENT_ORIGIN)
          .set('X-CSRF-Token', token)
          .send({ status: 'INACTIVE' }),
        admin
          .patch(`/api/employees/${adminId}`)
          .set('Origin', config.CLIENT_ORIGIN)
          .set('X-CSRF-Token', token)
          .send({ roleId: role.id }),
      ]);
      expect(results.map((r) => r.status)).toEqual([409, 409]);
    } finally {
      await db.user.updateMany({
        where: { id: { in: others.map((r) => r.id) } },
        data: { status: 'ACTIVE' },
      });
    }
  });
  it('enforces membership and per-task authorization, safe removal, and active assignment', async () => {
    const { projectId, id } = await setupTask();
    const developer = await login('developer'),
      outsider = await login('it_support');
    await developer.get(`/api/projects/${projectId}`).expect(200);
    await outsider.get(`/api/projects/${projectId}`).expect(404);
    await outsider.get(`/api/tasks/${id}`).expect(404);
    expect(
      (await write(developer, 'patch', `/api/tasks/${id}`, { title: 'Unauthorized edit' })).status,
    ).toBe(403);
    expect(
      (await write(developer, 'patch', `/api/tasks/${id}/status`, { status: 'IN_PROGRESS' }))
        .status,
    ).toBe(200);
    expect(
      (await write(admin, 'delete', `/api/projects/${projectId}/members/${users.developer}`))
        .status,
    ).toBe(409);
    expect(
      (await write(admin, 'patch', `/api/tasks/${id}`, { assigneeId: users.it_support })).status,
    ).toBe(409);
    expect((await write(admin, 'patch', `/api/tasks/${id}`, { assigneeId: null })).status).toBe(
      200,
    );
    expect(
      (await write(admin, 'delete', `/api/projects/${projectId}/members/${users.developer}`))
        .status,
    ).toBe(200);
    await developer.get(`/api/tasks/${id}`).expect(404);
    expect(
      (await write(admin, 'delete', `/api/projects/${projectId}/members/${users.project_manager}`))
        .status,
    ).toBe(409);
    expect(
      (
        await write(admin, 'post', `/api/projects/${projectId}/members`, {
          userId: users.project_manager,
        })
      ).status,
    ).toBe(409);
    const inactiveRole = await db.role.findUniqueOrThrow({ where: { key: 'employee' } });
    const inactive = await db.user.create({
      data: {
        name: 'Inactive',
        email: `inactive-${runId}@test.local`,
        passwordHash: await argon2.hash(password, passwordOptions),
        roleId: inactiveRole.id,
        status: 'INACTIVE',
      },
    });
    users.inactive = inactive.id;
    expect(
      (await write(admin, 'post', `/api/projects/${projectId}/members`, { userId: inactive.id }))
        .status,
    ).toBe(409);
  });
  it('calculates progress and timestamps, completes and reopens projects, and preserves archived tasks', async () => {
    const { projectId, id } = await setupTask();
    expect(
      (await write(admin, 'patch', `/api/projects/${projectId}`, { status: 'COMPLETED' })).status,
    ).toBe(409);
    const completed = await write(admin, 'patch', `/api/tasks/${id}/status`, {
      status: 'COMPLETED',
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data.completedAt).toBeTruthy();
    expect((await admin.get(`/api/projects/${projectId}`)).body.data.progress).toBe(100);
    expect(
      (await write(admin, 'patch', `/api/projects/${projectId}`, { status: 'COMPLETED' })).body.data
        .actualCompletionDate,
    ).toBeTruthy();
    expect(
      (await write(admin, 'patch', `/api/tasks/${id}`, { title: 'Completed edit' })).body.data
        .completedAt,
    ).toBe(completed.body.data.completedAt);
    expect(
      (await write(admin, 'patch', `/api/tasks/${id}/status`, { status: 'TODO' })).body.data
        .completedAt,
    ).toBeNull();
    const project = (await admin.get(`/api/projects/${projectId}`)).body.data;
    expect(project.status).toBe('ACTIVE');
    expect(project.actualCompletionDate).toBeNull();
    expect(project.progress).toBe(0);
    expect(
      (await write(admin, 'patch', `/api/tasks/${id}/status`, { status: 'COMPLETED' })).status,
    ).toBe(200);
    expect(
      (await write(admin, 'patch', `/api/projects/${projectId}`, { status: 'COMPLETED' })).status,
    ).toBe(200);
    expect((await write(admin, 'delete', `/api/tasks/${id}`)).status).toBe(200);
    expect((await admin.get(`/api/projects/${projectId}`)).body.data).toMatchObject({
      status: 'ACTIVE',
      progress: 0,
      totalTasks: 0,
    });
    expect((await db.task.findUniqueOrThrow({ where: { id } })).archivedAt).not.toBeNull();
    const logs = await db.auditLog.findMany({ where: { entityType: 'Task', entityId: id } });
    expect(logs.some((r) => r.action === 'task.completed')).toBe(true);
    expect(logs.some((r) => r.action === 'task.archived')).toBe(true);
  });
  it('validates tasks, filters and paginates, and limits employees to their own work', async () => {
    const { projectId, id, input } = await setupTask(users.employee!);
    const employee = await login('employee');
    const second = await write(admin, 'post', '/api/tasks', {
      ...input,
      code: `OTH-${runId}`,
      assigneeId: null,
    });
    expect(second.status).toBe(201);
    const own = await employee.get(`/api/tasks?projectId=${projectId}`);
    expect(own.body.data.total).toBe(1);
    expect(own.body.data.items[0].id).toBe(id);
    await employee.get(`/api/tasks/${second.body.data.id}`).expect(404);
    expect(
      (
        await write(employee, 'patch', `/api/tasks/${id}/status`, {
          status: 'IN_REVIEW',
          assigneeId: adminId,
        })
      ).status,
    ).toBe(422);
    expect(
      (await write(employee, 'patch', `/api/tasks/${id}/status`, { status: 'IN_REVIEW' })).status,
    ).toBe(200);
    expect(
      (await admin.get(`/api/tasks?projectId=${projectId}&pageSize=1`)).body.data,
    ).toMatchObject({ total: 2, pages: 2 });
    expect(
      (
        await admin.get(
          `/api/tasks?projectId=${projectId}&status=IN_REVIEW&priority=HIGH&assigneeId=${users.employee}`,
        )
      ).body.data.total,
    ).toBe(1);
    expect(
      (
        await write(admin, 'post', '/api/tasks', {
          ...input,
          code: `BAD-${runId}`,
          dueDate: '2026-09-01',
        })
      ).status,
    ).toBe(422);
    expect((await write(admin, 'post', '/api/tasks', input)).status).toBe(409);
    expect(
      (await write(admin, 'patch', `/api/tasks/${id}`, { completedAt: new Date().toISOString() }))
        .status,
    ).toBe(422);
    expect((await write(admin, 'delete', `/api/projects/${projectId}`)).status).toBe(200);
    expect(
      (await write(employee, 'patch', `/api/tasks/${id}/status`, { status: 'COMPLETED' })).status,
    ).toBe(409);
    expect((await db.task.findUniqueOrThrow({ where: { id } })).status).toBe('IN_REVIEW');
    expect((await write(admin, 'post', `/api/projects/${projectId}/restore`)).status).toBe(200);
    expect((await employee.get(`/api/tasks?projectId=${projectId}`)).body.data.total).toBe(1);
  });
  it('returns real scoped dashboard statistics and refreshes after task and project changes', async () => {
    const { projectId, id, input } = await setupTask(users.it_support!);
    const support = await login('it_support');
    const future = '2099-01-01';
    expect((await write(admin, 'patch', `/api/tasks/${id}`, { dueDate: future })).status).toBe(200);
    expect(
      (await write(admin, 'patch', `/api/projects/${projectId}`, { status: 'ACTIVE' })).status,
    ).toBe(200);
    const hidden = await write(
      admin,
      'post',
      '/api/projects',
      await projectInput({ managerId: adminId, budget: '999999.99' }),
    );
    expect(hidden.status).toBe(201);
    expect(
      (
        await write(admin, 'post', '/api/tasks', {
          ...input,
          projectId: hidden.body.data.id,
          code: `HIDDEN-${runId}`,
          title: 'Private task',
          assigneeId: null,
        })
      ).status,
    ).toBe(201);
    const overview = (await support.get('/api/dashboard').expect(200)).body.data;
    expect(overview.metrics).toEqual({
      totalProjects: 1,
      activeProjects: 1,
      pendingTasks: 1,
      completedProjects: 0,
      totalBudget: 12345.67,
    });
    expect(overview.budgetSeries).toEqual([{ month: '2026-10', budget: 12345.67 }]);
    expect(overview.myTasks.map((t: { id: string }) => t.id)).toEqual([id]);
    expect(overview.deadlines.map((t: { id: string }) => t.id)).toEqual([id]);
    expect(overview.teamWorkload).toEqual([
      { userId: users.it_support, name: 'Core it_support', assignedTasks: 1, completedTasks: 0 },
    ]);
    expect(overview.recentActivity.length).toBeGreaterThan(0);
    expect(
      overview.recentActivity.every((r: { projectId: string }) => r.projectId === projectId),
    ).toBe(true);
    expect(JSON.stringify(overview)).not.toContain('Private task');
    expect(JSON.stringify(overview)).not.toContain('expenses');
    expect(
      (await write(support, 'patch', `/api/tasks/${id}/status`, { status: 'COMPLETED' })).status,
    ).toBe(200);
    expect(
      (await write(admin, 'patch', `/api/projects/${projectId}`, { status: 'COMPLETED' })).status,
    ).toBe(200);
    const done = (await support.get('/api/dashboard')).body.data;
    expect(done.metrics).toMatchObject({
      completedProjects: 1,
      pendingTasks: 0,
      activeProjects: 0,
    });
    expect(done.myTasks).toEqual([]);
    expect(done.deadlines).toEqual([]);
    expect(done.projectStatus.find((s: { status: string }) => s.status === 'COMPLETED').count).toBe(
      1,
    );
    expect((await write(admin, 'delete', `/api/projects/${projectId}`)).status).toBe(200);
    const archived = (await support.get('/api/dashboard')).body.data;
    expect(Object.values(archived.metrics)).toEqual([0, 0, 0, 0, 0]);
    expect(archived.recentActivity).toEqual([]);
  });
  it('preserves saved task data and the existing authenticated session across an API restart', async () => {
    const { id } = await setupTask();
    const token = (await admin.get('/api/auth/csrf')).body.data.csrfToken as string;
    const response = await admin.get(`/api/tasks/${id}`).expect(200);
    const cookie = (await write(admin, 'post', '/api/auth/login', { email, password })).headers[
      'set-cookie'
    ] as unknown as string[];
    expect(token).toBeTruthy();
    await runtime.close();
    runtime = await createApp(config, db);
    const restarted = await request(runtime.app)
      .get(`/api/tasks/${id}`)
      .set('Cookie', cookie.map((c) => c.split(';')[0]).join('; '))
      .expect(200);
    expect(restarted.body.data.code).toBe(response.body.data.code);
    expect(restarted.body.data.title).toBe(response.body.data.title);
  });
  it('serializes competing member removal and new task assignments without orphaned responsibility', async () => {
    const { projectId, id, input } = await setupTask();
    expect((await write(admin, 'patch', `/api/tasks/${id}`, { assigneeId: null })).status).toBe(
      200,
    );
    const token = (await admin.get('/api/auth/csrf')).body.data.csrfToken as string;
    const [remove, assign] = await Promise.all([
      admin
        .delete(`/api/projects/${projectId}/members/${users.developer}`)
        .set('Origin', config.CLIENT_ORIGIN)
        .set('X-CSRF-Token', token)
        .send({}),
      admin
        .post('/api/tasks')
        .set('Origin', config.CLIENT_ORIGIN)
        .set('X-CSRF-Token', token)
        .send({ ...input, code: `RACE-${runId}` }),
    ]);
    expect([200, 409]).toContain(remove.status);
    expect([201, 409]).toContain(assign.status);
    expect(remove.status === 200 && assign.status === 201).toBe(false);
    const assigned = await db.task.count({
      where: {
        projectId,
        assigneeId: users.developer,
        archivedAt: null,
        status: { not: 'COMPLETED' },
      },
    });
    if (assigned)
      expect(await db.projectMember.count({ where: { projectId, userId: users.developer } })).toBe(
        1,
      );
  });
  it('preserves project membership during manager handoff and rejects unsafe employee deactivation', async () => {
    const { projectId } = await setupTask();
    expect(
      (
        await write(admin, 'patch', `/api/employees/${users.developer}/status`, {
          status: 'INACTIVE',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await write(admin, 'patch', `/api/employees/${users.project_manager}/status`, {
          status: 'INACTIVE',
        })
      ).status,
    ).toBe(409);
    expect(
      (await write(admin, 'patch', `/api/projects/${projectId}`, { managerId: adminId })).status,
    ).toBe(200);
    const members = (await admin.get(`/api/projects/${projectId}/members`)).body.data.items as {
      userId: string;
      role: string;
    }[];
    expect(members.find((r) => r.userId === adminId)?.role).toBe('Project manager');
    expect(members.find((r) => r.userId === users.project_manager)?.role).toBe('Member');
    const formerManager = await login('project_manager');
    await formerManager.get(`/api/projects/${projectId}`).expect(200);
    expect(
      (await write(formerManager, 'patch', `/api/projects/${projectId}`, { name: 'Not allowed' }))
        .status,
    ).toBe(403);
  });
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
      expect((await agent.get(`/api/projects?q=${input.code}`)).body.data.total).toBe(0);
      expect((await write(agent, 'post', '/api/projects', input)).status).toBe(403);
    }
    expect(
      (await manager.get(`/api/projects?managerId=${adminId}&q=OTHER-${runId}`)).body.data.total,
    ).toBe(0);
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
