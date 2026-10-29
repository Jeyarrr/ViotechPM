import 'dotenv/config';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { createDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/services/bootstrap.service.js';
import { audit } from '../src/services/core.service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL)
  throw new Error('Separate _test database required.');
const db = createDatabase(url);
const suffix = randomUUID();
const password = randomBytes(24).toString('hex');
const email = `collab-${suffix}@test.local`;
const origin = 'http://localhost:5173';
let runtime: Awaited<ReturnType<typeof createApp>>;
let admin: ReturnType<typeof request.agent>;
let employee: ReturnType<typeof request.agent>;
let userId = String(randomUUID()),
  employeeId = String(randomUUID()),
  projectId = String(randomUUID()),
  clientId = String(randomUUID()),
  base = '';
const sockets: Socket[] = [];
async function write(
  agent: ReturnType<typeof request.agent>,
  method: 'post' | 'patch' | 'delete',
  path: string,
  body: object = {},
) {
  const csrf = await agent.get('/api/auth/csrf');
  return agent[method](path)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send(body);
}
async function socketSession(loginEmail = email) {
  const agent = request.agent(runtime.server);
  const response = await write(agent, 'post', '/api/auth/login', { email: loginEmail, password });
  expect(response.status).toBe(200);
  const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken;
  return { cookie: response.headers['set-cookie']![0]!.split(';')[0] as string, token };
}
async function connect(session?: { cookie: string; token: string }, socketOrigin = origin) {
  const socket = io(base, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { Origin: socketOrigin, ...(session ? { Cookie: session.cookie } : {}) },
    auth: { csrfToken: session?.token },
  });
  sockets.push(socket);
  return new Promise<Socket>((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
    stdio: 'pipe',
    windowsHide: true,
  });
  await bootstrap(db, {
    BOOTSTRAP_ADMIN_NAME: 'Collaboration admin',
    BOOTSTRAP_ADMIN_EMAIL: email,
    BOOTSTRAP_ADMIN_PASSWORD: password,
  });
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  userId = user.id;
  const role = await db.role.findUniqueOrThrow({ where: { key: 'employee' } });
  employeeId = (
    await db.user.create({
      data: {
        name: 'Collaboration employee',
        email: `employee-${email}`,
        passwordHash: user.passwordHash,
        roleId: role.id,
      },
    })
  ).id;
  clientId = (
    await db.client.create({
      data: {
        code: `C-${suffix.slice(0, 8).toUpperCase()}`,
        name: 'Collaboration client',
        type: 'BUSINESS',
        createdById: userId,
      },
    })
  ).id;
  const category = await db.projectCategory.findFirstOrThrow();
  projectId = (
    await db.project.create({
      data: {
        code: `P-${suffix.slice(0, 8).toUpperCase()}`,
        name: 'Collaboration project',
        clientId,
        categoryId: category.id,
        managerId: userId,
        createdById: userId,
        startDate: new Date('2026-10-01'),
        targetDate: new Date('2026-12-31'),
      },
    })
  ).id;
  runtime = await createApp(
    {
      NODE_ENV: 'test',
      PORT: 4000,
      CLIENT_ORIGIN: origin,
      DATABASE_URL: url!,
      SESSION_SECRET: randomBytes(48).toString('hex'),
      TRUST_PROXY: '0',
    },
    db,
  );
  await new Promise<void>((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
  const address = runtime.server.address();
  if (!address || typeof address === 'string') throw Error('No server address');
  base = `http://127.0.0.1:${address.port}`;
  admin = request.agent(runtime.app);
  employee = request.agent(runtime.app);
  expect((await write(admin, 'post', '/api/auth/login', { email, password })).status).toBe(200);
  expect(
    (await write(employee, 'post', '/api/auth/login', { email: `employee-${email}`, password }))
      .status,
  ).toBe(200);
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await runtime?.close();
  await db.notification.deleteMany({ where: { projectId } });
  await db.auditLog.deleteMany({
    where: { OR: [{ projectId }, { actorId: { in: [userId, employeeId] } }] },
  });
  await db.taskCommentMention.deleteMany({ where: { comment: { task: { projectId } } } });
  await db.taskComment.deleteMany({ where: { task: { projectId } } });
  await db.task.deleteMany({ where: { projectId } });
  await db.projectMember.deleteMany({ where: { projectId } });
  await db.project.deleteMany({ where: { id: projectId } });
  await db.client.deleteMany({ where: { id: clientId } });
  await db.user.deleteMany({ where: { id: { in: [userId, employeeId] } } });
  await db.$disconnect();
});
it('rejects anonymous and foreign-origin socket connections', async () => {
  await expect(connect()).rejects.toThrow();
  await expect(connect(await socketSession(), 'https://untrusted.invalid')).rejects.toThrow();
});
it('authenticates the existing cookie session and authorizes project rooms', async () => {
  const socket = await connect(await socketSession(`employee-${email}`));
  const denied = await socket.emitWithAck('subscribe', { kind: 'project', id: projectId });
  expect(denied.ok).toBe(false);
  const adminSocket = await connect(await socketSession());
  expect((await adminSocket.emitWithAck('subscribe', { kind: 'project', id: projectId })).ok).toBe(
    true,
  );
});
it('persists assignment notifications atomically and emits only to the recipient after commit', async () => {
  const socket = await connect(await socketSession(`employee-${email}`));
  const other = await connect(await socketSession());
  let leaked = false;
  other.on('notifications:changed', () => {
    leaked = true;
  });
  const received = new Promise<void>((resolve) => socket.once('notifications:changed', resolve));
  await db.$transaction(async (tx) => {
    await tx.projectMember.create({
      data: { projectId, userId: employeeId, assignedById: userId },
    });
    await audit(tx, userId, 'project.member_assigned', 'Project', projectId, {
      userId: employeeId,
    });
  });
  await received;
  const response = await employee.get('/api/notifications');
  expect(response.status).toBe(200);
  expect(response.body.data.total).toBe(1);
  expect(leaked).toBe(false);
  const item = response.body.data.items[0];
  expect((await write(admin, 'patch', `/api/notifications/${item.id}/read`)).status).toBe(404);
  expect((await write(employee, 'patch', `/api/notifications/${item.id}/read`)).status).toBe(200);
  expect((await employee.get('/api/notifications/unread-count')).body.data.count).toBe(0);
  socket.disconnect();
  await connect(await socketSession(`employee-${email}`));
  expect((await employee.get('/api/notifications')).body.data.items[0].readAt).not.toBeNull();
});
it('deduplicates delivery keys and rolls back notifications with their transaction', async () => {
  const row = await db.notification.findFirstOrThrow({ where: { recipientId: employeeId } });
  const { id: _id, ...data } = row;
  void _id;
  expect((await db.notification.createMany({ data: [data], skipDuplicates: true })).count).toBe(0);
  const before = await db.notification.count({ where: { recipientId: employeeId } });
  await expect(
    db.$transaction(async (tx) => {
      await audit(tx, userId, 'project.member_assigned', 'Project', projectId, {
        userId: employeeId,
      });
      throw Error('Rollback');
    }),
  ).rejects.toThrow('Rollback');
  expect(await db.notification.count({ where: { recipientId: employeeId } })).toBe(before);
});

it('supports authorized discussion, safe mentions, edit policy and soft deletion', async () => {
  const task = await db.task.create({
    data: {
      code: 'T-' + suffix.slice(0, 8).toUpperCase(),
      title: 'Discuss this task',
      projectId,
      assigneeId: employeeId,
      createdById: userId,
      startDate: new Date('2026-10-01'),
      dueDate: new Date('2026-12-01'),
    },
  });
  const socket = await connect(await socketSession());
  const event = new Promise<void>((resolve) => socket.once('workspace:changed', () => resolve()));
  const created = await write(employee, 'post', '/api/tasks/' + task.id + '/comments', {
    content: '<script>alert(1)</script> Task update',
    mentionIds: [userId, userId],
  });
  expect(created.status).toBe(201);
  await event;
  const commentId = created.body.data.id;
  expect(await db.taskCommentMention.count({ where: { commentId } })).toBe(1);
  expect(
    await db.notification.count({
      where: { recipientId: userId, dedupeKey: 'comment:' + commentId },
    }),
  ).toBe(1);
  const comments = await employee.get('/api/tasks/' + task.id + '/comments');
  expect(comments.body.data.items[0].content).toContain('<script>');
  expect(
    (
      await write(admin, 'patch', '/api/tasks/' + task.id + '/comments/' + commentId, {
        content: 'Unauthorized edit',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await write(employee, 'patch', '/api/tasks/' + task.id + '/comments/' + commentId, {
        content: 'Updated comment',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await write(employee, 'post', '/api/tasks/' + task.id + '/comments', {
        content: 'Invalid mention',
        mentionIds: [randomUUID()],
      })
    ).status,
  ).toBe(422);
  await db.taskComment.update({
    where: { id: commentId },
    data: { createdAt: new Date(Date.now() - 2 * 86400000) },
  });
  expect(
    (
      await write(employee, 'patch', '/api/tasks/' + task.id + '/comments/' + commentId, {
        content: 'Too late',
      })
    ).status,
  ).toBe(403);
  expect(
    (await write(admin, 'delete', '/api/tasks/' + task.id + '/comments/' + commentId)).status,
  ).toBe(200);
  expect(
    (await employee.get('/api/tasks/' + task.id + '/comments')).body.data.items[0].content,
  ).toBe('');
  expect((await db.taskComment.findUniqueOrThrow({ where: { id: commentId } })).content).toBe(
    'Updated comment',
  );
  await db.task.update({ where: { id: task.id }, data: { assigneeId: null } });
  expect((await employee.get('/api/tasks/' + task.id + '/comments')).status).toBe(404);
  expect(
    (await write(employee, 'post', '/api/tasks/' + task.id + '/comments', { content: 'Denied' }))
      .status,
  ).toBe(404);
});
it('presents scoped, paginated project activity without private audit metadata', async () => {
  const all = await admin.get('/api/projects/' + projectId + '/activities?pageSize=1');
  expect(all.status).toBe(200);
  expect(all.body.data.items).toHaveLength(1);
  expect(all.body.data.items[0]).not.toHaveProperty('metadata');
  const comments = await employee.get('/api/projects/' + projectId + '/activities?type=comment');
  expect(comments.body.data.total).toBe(0); // Task is no longer assigned to this employee.
  const adminComments = await admin.get('/api/projects/' + projectId + '/activities?type=comment');
  expect(adminComments.body.data.total).toBeGreaterThan(0);
});
it('removes notification access and room subscriptions after membership removal', async () => {
  const socket = await connect(await socketSession(`employee-${email}`));
  expect((await socket.emitWithAck('subscribe', { kind: 'project', id: projectId })).ok).toBe(true);
  await db.$transaction(async (tx) => {
    await tx.projectMember.deleteMany({ where: { projectId, userId: employeeId } });
    await audit(tx, userId, 'project.member_removed', 'Project', projectId, { userId: employeeId });
  });
  await expect
    .poll(() =>
      runtime.realtime.io.sockets.sockets.get(socket.id!)?.rooms.has(`project:${projectId}`),
    )
    .toBe(false);
  expect((await employee.get('/api/notifications')).body.data.total).toBe(0);
});
it('disconnects deactivated users and prevents further API access', async () => {
  const socket = await connect(await socketSession(`employee-${email}`));
  await db.user.update({ where: { id: employeeId }, data: { status: 'INACTIVE' } });
  await socket.emitWithAck('subscribe', { kind: 'project', id: projectId }).catch(() => undefined);
  await expect.poll(() => socket.connected).toBe(false);
  expect((await employee.get('/api/notifications')).status).toBe(401);
});
