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
  throw new Error('Operations tests require a separate _test database.');
const db = createDatabase(testUrl),
  runId = randomBytes(6).toString('hex'),
  password = randomBytes(24).toString('base64url');
const config: AppConfig = {
  NODE_ENV: 'test',
  PORT: 4000,
  CLIENT_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: testUrl,
  SESSION_SECRET: randomBytes(48).toString('hex'),
  TRUST_PROXY: '0',
};
const ids: Record<string, string> = {};
let runtime: Awaited<ReturnType<typeof createApp>>, admin: ReturnType<typeof request.agent>;
type Agent = ReturnType<typeof request.agent>;
async function write(
  agent: Agent,
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
async function login(key = 'admin') {
  const agent = request.agent(runtime.app);
  expect(
    (
      await write(agent, 'post', '/api/auth/login', {
        email: `ops-${key}-${runId}@test.viotech.local`,
        password,
      })
    ).status,
  ).toBe(200);
  return agent;
}
async function fixture(secondReview = true) {
  const suffix = randomBytes(4).toString('hex').toUpperCase();
  const client = await db.client.create({
    data: {
      code: `OPS-${suffix}`,
      name: `Operations ${runId}`,
      type: 'BUSINESS',
      status: 'ACTIVE',
      createdById: ids.admin!,
    },
  });
  const category = await db.projectCategory.findFirstOrThrow({ where: { active: true } }),
    department = await db.department.findFirstOrThrow();
  const project = await db.project.create({
    data: {
      code: `OPS-P-${suffix}`,
      name: `Operations project ${suffix}`,
      clientId: client.id,
      categoryId: category.id,
      managerId: ids.manager!,
      departmentId: department.id,
      startDate: new Date('2026-10-01'),
      targetDate: new Date('2026-12-31'),
      budget: '1000.00',
      status: 'ACTIVE',
      createdById: ids.admin!,
    },
  });
  await db.projectMember.createMany({
    data: ['manager', 'developer', 'employee'].map((key) => ({
      projectId: project.id,
      userId: ids[key]!,
      assignedById: ids.admin!,
    })),
  });
  await db.approvalPolicy.create({
    data: {
      projectId: project.id,
      primaryReviewerId: ids.manager!,
      finalReviewerId: ids.reviewer!,
      requireSecondReview: secondReview,
      updatedById: ids.admin!,
    },
  });
  const type = await db.transactionType.findFirstOrThrow({ where: { active: true } });
  return {
    project,
    type,
    input: {
      projectId: project.id,
      typeId: type.id,
      title: `Request ${suffix}`,
      requestedAmount: '100.25',
      transactionDate: '2026-10-29',
      description: 'Business request',
      notes: 'Supporting notes',
    },
  };
}
async function createRequest(input: object, key = 'developer') {
  const agent = await login(key),
    created = await write(agent, 'post', '/api/transactions', input);
  expect(created.status).toBe(201);
  return {
    agent,
    item: created.body.data as {
      id: string;
      reference: string;
      requestedAmount: string;
      requesterId: string;
      status: string;
    },
  };
}
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_DATABASE_URL: testUrl },
    stdio: 'pipe',
    windowsHide: true,
  });
  await bootstrap(db, {
    BOOTSTRAP_ADMIN_NAME: 'Operations admin',
    BOOTSTRAP_ADMIN_EMAIL: `ops-admin-${runId}@test.viotech.local`,
    BOOTSTRAP_ADMIN_PASSWORD: password,
  });
  ids.admin = (
    await db.user.findUniqueOrThrow({ where: { email: `ops-admin-${runId}@test.viotech.local` } })
  ).id;
  const hash = await argon2.hash(password, passwordOptions);
  for (const [key, roleKey] of [
    ['reviewer', 'super_admin'],
    ['manager', 'project_manager'],
    ['developer', 'developer'],
    ['employee', 'employee'],
    ['outsider', 'it_support'],
  ]) {
    const role = await db.role.findUniqueOrThrow({ where: { key: roleKey! } });
    ids[key!] = (
      await db.user.create({
        data: {
          name: `Operations ${key}`,
          email: `ops-${key}-${runId}@test.viotech.local`,
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
  if (!ids.admin) {
    await db.$disconnect();
    return;
  }
  const userIds = Object.values(ids),
    projectWhere = { createdById: ids.admin };
  await db.approvalDecision.deleteMany({
    where: { step: { workflow: { transaction: { project: projectWhere } } } },
  });
  await db.approvalStep.deleteMany({
    where: { workflow: { transaction: { project: projectWhere } } },
  });
  await db.approvalWorkflow.deleteMany({ where: { transaction: { project: projectWhere } } });
  await db.projectTransaction.deleteMany({ where: { project: projectWhere } });
  await db.approvalPolicy.deleteMany({ where: { project: projectWhere } });
  await db.task.deleteMany({ where: { project: projectWhere } });
  await db.milestone.deleteMany({ where: { project: projectWhere } });
  await db.projectMember.deleteMany({ where: { project: projectWhere } });
  await db.project.deleteMany({ where: projectWhere });
  await db.client.deleteMany({ where: { createdById: ids.admin } });
  await db.transactionType.deleteMany({ where: { name: { contains: runId } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe('Project transactions and approval workflows', () => {
  it('creates real draft requests with decimal amounts and rejects forged financial or identity fields', async () => {
    const { input, project } = await fixture(),
      { agent, item } = await createRequest({ ...input, requestedAmount: '0.10' });
    expect(item.status).toBe('DRAFT');
    expect(item.requesterId).toBe(ids.developer);
    expect(typeof item.requestedAmount).toBe('string');
    const row = await db.projectTransaction.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.requestedAmount.toFixed(2)).toBe('0.10');
    expect(row.currency).toBe('PHP');
    expect(row.departmentId).toBe(project.departmentId);
    for (const amount of ['0', '-1', '1.001', '1e3', 'not-a-number', '999999999999999999'])
      expect(
        (await write(agent, 'post', '/api/transactions', { ...input, requestedAmount: amount }))
          .status,
      ).toBe(422);
    for (const fields of [
      { status: 'APPROVED' },
      { requesterId: ids.admin },
      { currency: 'USD' },
      { departmentId: project.departmentId },
    ])
      expect(
        (await write(agent, 'post', '/api/transactions', { ...input, ...fields })).status,
      ).toBe(422);
    const outsider = await login('outsider');
    expect((await write(outsider, 'post', '/api/transactions', input)).status).toBe(404);
    expect(
      await db.auditLog.count({
        where: {
          entityType: 'ProjectTransaction',
          entityId: item.id,
          action: 'transaction.created',
        },
      }),
    ).toBe(1);
  });
  it('allows only requester draft/revision edits, preserves submitted values, and cancels eligible requests', async () => {
    const { input } = await fixture(),
      { agent, item } = await createRequest(input),
      manager = await login('manager'),
      other = await login('employee');
    await other.get(`/api/transactions/${item.id}`).expect(404);
    expect(
      (
        await write(manager, 'patch', `/api/transactions/${item.id}`, {
          title: 'Unauthorized edit',
        })
      ).status,
    ).toBe(403);
    expect(
      (await write(agent, 'patch', `/api/transactions/${item.id}`, { requestedAmount: '200.20' }))
        .status,
    ).toBe(200);
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(200);
    expect(
      (await write(agent, 'patch', `/api/transactions/${item.id}`, { requestedAmount: '999' }))
        .status,
    ).toBe(409);
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(409);
    expect(
      (
        await write(agent, 'post', `/api/transactions/${item.id}/cancel`, {
          comment: 'No longer needed',
        })
      ).body.data.status,
    ).toBe('CANCELLED');
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(409);
    expect(
      (
        await db.projectTransaction.findUniqueOrThrow({ where: { id: item.id } })
      ).requestedAmount.toFixed(2),
    ).toBe('200.20');
    expect(
      await db.approvalWorkflow.count({ where: { transactionId: item.id, status: 'CANCELLED' } }),
    ).toBe(1);
  });
  it('requires every configured review stage, prevents premature or duplicate decisions, and records immutable history', async () => {
    const { input } = await fixture(),
      { agent, item } = await createRequest(input),
      manager = await login('manager'),
      reviewer = await login('reviewer');
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(200);
    const pending = await manager.get('/api/approvals/pending');
    expect(pending.body.data.items.some((t: { id: string }) => t.id === item.id)).toBe(true);
    expect((await write(reviewer, 'post', `/api/approvals/${item.id}/approve`)).status).toBe(403);
    const first = await write(manager, 'post', `/api/approvals/${item.id}/approve`, {
      comment: 'Project review completed',
    });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('UNDER_REVIEW');
    expect(first.body.data.approvedAt).toBeNull();
    expect((await write(manager, 'post', `/api/approvals/${item.id}/approve`)).status).toBe(409);
    expect(
      (
        await write(reviewer, 'post', `/api/approvals/${item.id}/approve`, {
          approverId: ids.admin,
        })
      ).status,
    ).toBe(422);
    const final = await write(reviewer, 'post', `/api/approvals/${item.id}/approve`);
    expect(final.status).toBe(200);
    expect(final.body.data.status).toBe('APPROVED');
    expect(final.body.data.approvedAt).toBeTruthy();
    expect(
      (await write(agent, 'patch', `/api/transactions/${item.id}`, { requestedAmount: '1' }))
        .status,
    ).toBe(409);
    const history = (await agent.get(`/api/transactions/${item.id}/history`)).body.data;
    expect(history.total).toBe(1);
    expect(history.items[0].steps.every((s: { state: string }) => s.state === 'DECIDED')).toBe(
      true,
    );
    expect(
      await db.approvalDecision.count({
        where: { step: { workflow: { transactionId: item.id } } },
      }),
    ).toBe(2);
    expect(
      (await write(reviewer, 'patch', `/api/approvals/${item.id}`, { outcome: 'REJECTED' })).status,
    ).toBe(404);
  });
  it('requires revision/rejection reasons and preserves each submission snapshot through revision', async () => {
    const { input } = await fixture(),
      { agent, item } = await createRequest(input),
      manager = await login('manager'),
      reviewer = await login('reviewer');
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(200);
    expect((await write(manager, 'post', `/api/approvals/${item.id}/return`)).status).toBe(422);
    expect(
      (
        await write(manager, 'post', `/api/approvals/${item.id}/return`, {
          comment: 'Attach the equipment justification',
        })
      ).body.data.status,
    ).toBe('RETURNED_FOR_REVISION');
    expect(
      (
        await write(agent, 'patch', `/api/transactions/${item.id}`, {
          requestedAmount: '50.50',
          notes: 'Updated justification',
        })
      ).status,
    ).toBe(200);
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(200);
    const history = (await agent.get(`/api/transactions/${item.id}/history?pageSize=1`)).body.data;
    expect(history.total).toBe(2);
    expect(history.pages).toBe(2);
    expect(history.items[0].attempt).toBe(2);
    expect(history.items[0].requestSnapshot.requestedAmount).toBe('50.5');
    const old = await db.approvalWorkflow.findFirstOrThrow({
      where: { transactionId: item.id, attempt: 1 },
    });
    expect(old.status).toBe('RETURNED');
    expect((old.requestSnapshot as { requestedAmount: string }).requestedAmount).toBe('100.25');
    expect((await write(manager, 'post', `/api/approvals/${item.id}/approve`)).status).toBe(200);
    expect(
      (await write(reviewer, 'post', `/api/approvals/${item.id}/reject`, { comment: '' })).status,
    ).toBe(422);
    const rejected = await write(reviewer, 'post', `/api/approvals/${item.id}/reject`, {
      comment: 'Not justified for this project',
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('REJECTED');
    expect(rejected.body.data.rejectedAt).toBeTruthy();
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(409);
  });
  it('denies self-approval and unauthorized reviewers, with a recorded denial event', async () => {
    const { project, input } = await fixture(),
      { agent, item } = await createRequest(input, 'manager');
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(409);
    expect(
      (
        await write(admin, 'patch', `/api/projects/${project.id}/approval-policy`, {
          primaryReviewerId: ids.admin,
          finalReviewerId: ids.reviewer,
          requireSecondReview: true,
        })
      ).status,
    ).toBe(200);
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(200);
    const own = await write(agent, 'post', `/api/approvals/${item.id}/approve`);
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
    const outsider = await login('outsider');
    expect((await write(outsider, 'post', `/api/approvals/${item.id}/approve`)).status).toBe(403);
    expect(
      await db.approvalDecision.count({
        where: { step: { workflow: { transactionId: item.id } } },
      }),
    ).toBe(0);
    expect(
      await db.auditLog.count({ where: { entityId: item.id, action: 'workflow.access_denied' } }),
    ).toBe(1);
  });
  it('serializes simultaneous conflicting decisions and creates only one decision for a stage', async () => {
    const { input } = await fixture(),
      { agent, item } = await createRequest(input),
      manager = await login('manager');
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(200);
    const token = (await manager.get('/api/auth/csrf')).body.data.csrfToken as string;
    const results = await Promise.all([
      manager
        .post(`/api/approvals/${item.id}/approve`)
        .set('Origin', config.CLIENT_ORIGIN)
        .set('X-CSRF-Token', token)
        .send({ comment: 'Accept' }),
      manager
        .post(`/api/approvals/${item.id}/reject`)
        .set('Origin', config.CLIENT_ORIGIN)
        .set('X-CSRF-Token', token)
        .send({ comment: 'Reject' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await db.approvalDecision.count({
        where: { step: { workflow: { transactionId: item.id } } },
      }),
    ).toBe(1);
  });
  it('restricts approval configuration and permits only explicit authorized single-stage policies', async () => {
    const { project, input } = await fixture(false),
      manager = await login('manager');
    expect(
      (
        await write(manager, 'patch', `/api/projects/${project.id}/approval-policy`, {
          primaryReviewerId: ids.manager,
          finalReviewerId: ids.reviewer,
          requireSecondReview: false,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await write(admin, 'patch', `/api/projects/${project.id}/approval-policy`, {
          primaryReviewerId: ids.admin,
          finalReviewerId: ids.admin,
          requireSecondReview: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await write(admin, 'patch', `/api/projects/${project.id}/approval-policy`, {
          primaryReviewerId: ids.manager,
          finalReviewerId: ids.developer,
          requireSecondReview: true,
        })
      ).status,
    ).toBe(409);
    const { agent, item } = await createRequest(input);
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(200);
    expect(
      (await write(manager, 'post', `/api/approvals/${item.id}/approve`)).body.data.status,
    ).toBe('APPROVED');
    expect(await db.approvalStep.count({ where: { workflow: { transactionId: item.id } } })).toBe(
      1,
    );
  });
  it('supports audited reassignment and protects pending reviewer accounts and manager handoff', async () => {
    const { project, input } = await fixture(),
      { agent, item } = await createRequest(input),
      manager = await login('manager'),
      reviewer = await login('reviewer');
    expect((await write(agent, 'post', `/api/transactions/${item.id}/submit`)).status).toBe(200);
    expect(
      (await write(admin, 'patch', `/api/employees/${ids.reviewer}/status`, { status: 'INACTIVE' }))
        .status,
    ).toBe(409);
    expect(
      (await write(admin, 'patch', `/api/projects/${project.id}`, { managerId: ids.admin })).status,
    ).toBe(409);
    const workflow = await db.approvalWorkflow.findFirstOrThrow({
      where: { transactionId: item.id },
      include: { steps: true },
    });
    const final = workflow.steps.find((s) => s.sequence === 2)!;
    expect(
      (
        await write(admin, 'post', `/api/approvals/${item.id}/reassign`, {
          stepId: final.id,
          approverId: ids.developer,
          comment: 'Invalid self reviewer',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await write(admin, 'post', `/api/approvals/${item.id}/reassign`, {
          stepId: final.id,
          approverId: ids.admin,
          comment: 'Reviewer availability change',
        })
      ).status,
    ).toBe(200);
    expect((await write(manager, 'post', `/api/approvals/${item.id}/approve`)).status).toBe(200);
    expect((await write(reviewer, 'post', `/api/approvals/${item.id}/approve`)).status).toBe(403);
    expect((await write(admin, 'post', `/api/approvals/${item.id}/approve`)).body.data.status).toBe(
      'APPROVED',
    );
    expect(
      await db.auditLog.count({ where: { entityId: item.id, action: 'approval.reassigned' } }),
    ).toBe(1);
  });
  it('configures transaction types and applies search/date/project/department filters within scope', async () => {
    const { project, input } = await fixture(),
      type = await write(admin, 'post', '/api/transaction-types', {
        name: `Custom ${runId}`,
        active: true,
      });
    expect(type.status).toBe(201);
    const { agent, item } = await createRequest({ ...input, typeId: type.body.data.id });
    expect(
      (
        await write(admin, 'patch', `/api/transaction-types/${type.body.data.id}`, {
          active: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (await write(agent, 'post', '/api/transactions', { ...input, typeId: type.body.data.id }))
        .status,
    ).toBe(409);
    expect(
      (
        await write(agent, 'patch', `/api/transactions/${item.id}`, {
          title: 'Updated historical type',
        })
      ).status,
    ).toBe(200);
    const query = `/api/transactions?projectId=${project.id}&typeId=${type.body.data.id}&departmentId=${project.departmentId}&q=${item.reference}&dateFrom=2026-10-01&dateTo=2026-10-31&pageSize=1`;
    expect((await agent.get(query)).body.data.total).toBe(1);
    const outsider = await login('outsider');
    expect((await outsider.get(query)).body.data.total).toBe(0);
    await outsider.get(`/api/transactions/${item.id}`).expect(404);
    expect(
      (await agent.get('/api/transactions?dateFrom=2026-11-01&dateTo=2026-10-01')).status,
    ).toBe(422);
    expect(
      (await write(agent, 'post', '/api/transaction-types', { name: 'Forbidden' })).status,
    ).toBe(403);
  });
});
