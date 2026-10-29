import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createDatabase } from '../src/config/database.js';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/services/bootstrap.service.js';
import { passwordOptions } from '../src/services/auth.service.js';
import type { AppConfig } from '../src/config/env.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error('TEST_DATABASE_URL is required to execute PostgreSQL authentication tests.');
const parsed = new URL(testUrl);
if (!parsed.pathname.endsWith('_test') || testUrl === process.env.DATABASE_URL)
  throw new Error('Tests require a separate database whose name ends in _test.');
const db = createDatabase(testUrl);
const runId = randomBytes(6).toString('hex');
const password = randomBytes(24).toString('base64url');
const email = `admin-${runId}@test.viotech.local`;
const employeeEmail = `employee-${runId}@test.viotech.local`;
const inactiveEmail = `inactive-${runId}@test.viotech.local`;
const config: AppConfig = {
  NODE_ENV: 'test',
  PORT: 4000,
  CLIENT_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: testUrl,
  SESSION_SECRET: randomBytes(48).toString('hex'),
  TRUST_PROXY: '0',
};
let runtime: Awaited<ReturnType<typeof createApp>>;
const bootstrapInput = {
  BOOTSTRAP_ADMIN_NAME: 'Integration Admin',
  BOOTSTRAP_ADMIN_EMAIL: email,
  BOOTSTRAP_ADMIN_PASSWORD: password,
};

async function csrf(agent: ReturnType<typeof request.agent>) {
  const result = await agent.get('/api/auth/csrf').expect(200);
  return result.body.data.csrfToken as string;
}
async function signIn(
  agent: ReturnType<typeof request.agent>,
  loginEmail = email,
  loginPassword = password,
) {
  const token = await csrf(agent);
  return agent
    .post('/api/auth/login')
    .set('Origin', config.CLIENT_ORIGIN)
    .set('X-CSRF-Token', token)
    .send({ email: loginEmail, password: loginPassword });
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
    throw new Error(
      'Test database migrations failed. Check the isolated PostgreSQL service and TEST_DATABASE_URL.',
    );
  }
  await db.$connect();
  await bootstrap(db, bootstrapInput);
  const employeeRole = await db.role.findUniqueOrThrow({ where: { key: 'employee' } });
  const hash = await argon2.hash(password, passwordOptions);
  await db.user.createMany({
    data: [
      { name: 'Test Employee', email: employeeEmail, passwordHash: hash, roleId: employeeRole.id },
      {
        name: 'Inactive Employee',
        email: inactiveEmail,
        passwordHash: hash,
        roleId: employeeRole.id,
        status: 'INACTIVE',
      },
    ],
  });
  runtime = await createApp(config, db);
});

afterAll(async () => {
  if (runtime) await runtime.close();
  const users = await db.user.findMany({
    where: { email: { endsWith: `${runId}@test.viotech.local` } },
    select: { id: true },
  });
  await db.auditLog.deleteMany({ where: { actorId: { in: users.map((user) => user.id) } } });
  await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  await db.$disconnect();
});

describe('PostgreSQL-backed authentication', () => {
  it('connects to PostgreSQL and returns structured health JSON', async () => {
    const response = await request(runtime.app).get('/api/health').expect(200);
    expect(response.body.data).toEqual({ status: 'ok', database: 'connected' });
  });
  it('seeds all roles and departments; repeating bootstrap preserves credentials', async () => {
    const before = await db.user.findUniqueOrThrow({ where: { email } });
    expect(
      await bootstrap(db, {
        ...bootstrapInput,
        BOOTSTRAP_ADMIN_PASSWORD: randomBytes(24).toString('hex'),
      }),
    ).toEqual({ created: false });
    const after = await db.user.findUniqueOrThrow({ where: { email } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await db.role.count()).toBe(5);
    expect(await db.department.count()).toBe(4);
  });
  it('rejects unauthenticated protected routes', async () => {
    for (const endpoint of ['/api/auth/me', '/api/dashboard', '/api/system/access']) {
      const response = await request(runtime.app).get(endpoint).expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
  it('uses HttpOnly, SameSite=Lax cookies and does not expose password hashes', async () => {
    const agent = request.agent(runtime.app);
    const response = await signIn(agent);
    expect(response.status).toBe(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toContain('HttpOnly');
    expect(cookies.join(';')).toContain('SameSite=Lax');
    expect(cookies.join(';')).not.toContain('Secure');
    expect(response.body.data.user.email).toBe(email);
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(JSON.stringify(response.body)).not.toContain('$argon2');
  });
  it('rotates the pre-login session and invalidates its identifier', async () => {
    const agent = request.agent(runtime.app);
    const before = await agent.get('/api/auth/csrf').expect(200);
    const oldCookie = (before.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const login = await agent
      .post('/api/auth/login')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('X-CSRF-Token', before.body.data.csrfToken)
      .send({ email, password })
      .expect(200);
    const newCookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(newCookie).not.toBe(oldCookie);
    await request(runtime.app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
  });
  it('rejects invalid credentials, unknown accounts, and inactive accounts identically', async () => {
    const agent = request.agent(runtime.app);
    for (const [loginEmail, loginPassword] of [
      [email, 'wrong-password'],
      [`unknown-${runId}@test.viotech.local`, password],
      [inactiveEmail, password],
    ]) {
      const response = await signIn(agent, loginEmail!, loginPassword!);
      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'The email or password is incorrect.',
      });
    }
  });
  it('validates malformed fields and does not support public registration', async () => {
    const agent = request.agent(runtime.app);
    const token = await csrf(agent);
    await agent
      .post('/api/auth/login')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('X-CSRF-Token', token)
      .send({ email: 'invalid', password: '' })
      .expect(422);
    await agent
      .post('/api/auth/register')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('X-CSRF-Token', token)
      .send({})
      .expect(404);
  });
  it('normalizes email case and surrounding whitespace', async () => {
    const agent = request.agent(runtime.app);
    const response = await signIn(agent, ` ${email.toUpperCase()} `);
    expect(response.status).toBe(200);
  });
  it('rejects missing, forged, and non-ASCII CSRF tokens', async () => {
    const agent = request.agent(runtime.app);
    await csrf(agent);
    await agent
      .post('/api/auth/login')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ email, password })
      .expect(403);
    for (const token of ['0'.repeat(64), 'é'.repeat(64)]) {
      const response = await agent
        .post('/api/auth/login')
        .set('Origin', config.CLIENT_ORIGIN)
        .set('X-CSRF-Token', token)
        .send({ email, password })
        .expect(403);
      expect(response.body.error.code).toBe('INVALID_CSRF');
    }
  });
  it('rejects untrusted and absent mutation origins', async () => {
    const agent = request.agent(runtime.app);
    const token = await csrf(agent);
    const response = await agent
      .post('/api/auth/login')
      .set('Origin', 'https://untrusted.invalid')
      .set('X-CSRF-Token', token)
      .send({ email, password })
      .expect(403);
    expect(response.body.error.code).toBe('INVALID_ORIGIN');
    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', token)
      .send({ email, password })
      .expect(403);
  });
  it('restricts CORS to the configured frontend origin', async () => {
    const response = await request(runtime.app)
      .get('/api/health')
      .set('Origin', 'https://untrusted.invalid');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });
  it('handles malformed JSON and unsupported content types', async () => {
    const agent = request.agent(runtime.app);
    const token = await csrf(agent);
    await agent
      .post('/api/auth/login')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('X-CSRF-Token', token)
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
    await agent
      .post('/api/auth/login')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('X-CSRF-Token', token)
      .type('form')
      .send({ email, password })
      .expect(415);
  });
  it('persists a session across clients (page refresh) in PostgreSQL', async () => {
    const agent = request.agent(runtime.app);
    const response = await signIn(agent);
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const me = await request(runtime.app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.data.user.email).toBe(email);
    expect(await db.session.count()).toBeGreaterThan(0);
  });
  it('enforces backend role authorization and returns real zero dashboard data', async () => {
    const employee = request.agent(runtime.app);
    expect((await signIn(employee, employeeEmail)).status).toBe(200);
    const denied = await employee.get('/api/system/access').expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    const dashboard = await employee.get('/api/dashboard').expect(200);
    expect(Object.values(dashboard.body.data.metrics)).toEqual([0, 0, 0, 0, 0]);
    expect(dashboard.body.data.budgetSeries).toEqual([]);
    const admin = request.agent(runtime.app);
    expect((await signIn(admin)).status).toBe(200);
    await admin.get('/api/system/access').expect(200);
  });
  it('applies role changes and inactive status to existing sessions immediately', async () => {
    const agent = request.agent(runtime.app);
    expect((await signIn(agent, employeeEmail)).status).toBe(200);
    const adminRole = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const employeeRole = await db.role.findUniqueOrThrow({ where: { key: 'employee' } });
    await db.user.update({ where: { email: employeeEmail }, data: { roleId: adminRole.id } });
    await agent.get('/api/system/access').expect(200);
    await db.user.update({ where: { email: employeeEmail }, data: { roleId: employeeRole.id } });
    await agent.get('/api/system/access').expect(403);
    await db.user.update({ where: { email: employeeEmail }, data: { status: 'INACTIVE' } });
    await agent.get('/api/auth/me').expect(401);
    await db.user.update({ where: { email: employeeEmail }, data: { status: 'ACTIVE' } });
    await agent.get('/api/auth/me').expect(401);
  });
  it('logs successful authentication and logout and invalidates the session', async () => {
    const agent = request.agent(runtime.app);
    const login = await signIn(agent);
    const oldCookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const token = await csrf(agent);
    await agent
      .post('/api/auth/logout')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('X-CSRF-Token', token)
      .send({})
      .expect(200);
    await agent.get('/api/auth/me').expect(401);
    await request(runtime.app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const events = await db.auditLog.findMany({ where: { actorId: user.id } });
    expect(events.some((row) => row.action === 'auth.login.succeeded')).toBe(true);
    expect(events.some((row) => row.action === 'auth.logout')).toBe(true);
    expect(user.lastLoginAt).not.toBeNull();
  });
  it('rejects expired sessions', async () => {
    const agent = request.agent(runtime.app);
    const login = await signIn(agent);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const signedValue = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
    const sid = signedValue.slice(2, signedValue.lastIndexOf('.'));
    await db.session.update({ where: { sid }, data: { expire: new Date(0) } });
    await agent.get('/api/auth/me').expect(401);
  });
  it('enforces the absolute eight-hour lifetime even when the stored expiry is extended', async () => {
    const agent = request.agent(runtime.app);
    const login = await signIn(agent);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const signedValue = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
    const sid = signedValue.slice(2, signedValue.lastIndexOf('.'));
    const stored = await db.session.findUniqueOrThrow({ where: { sid } });
    const payload = stored.sess;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new Error('Expected a session object.');
    await db.session.update({
      where: { sid },
      data: {
        sess: { ...payload, authenticatedAt: Date.now() - 8 * 60 * 60 * 1000 - 1000 },
      },
    });
    // The adapter's timestamp-without-time-zone uses PostgreSQL's local clock.
    await db.$executeRaw`UPDATE sessions SET expire = LOCALTIMESTAMP + INTERVAL '1 hour' WHERE sid = ${sid}`;
    await agent.get('/api/auth/me').expect(401);
    expect(await db.session.findUnique({ where: { sid } })).toBeNull();
  });
  it('sets Secure cookies in production behind an explicitly trusted TLS proxy', async () => {
    const production = await createApp(
      {
        ...config,
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://pm.viotech.test',
        TRUST_PROXY: '1',
      },
      db,
    );
    try {
      const response = await request(production.app)
        .get('/api/auth/csrf')
        .set('X-Forwarded-Proto', 'https')
        .expect(200);
      expect((response.headers['set-cookie'] as unknown as string[]).join(';')).toContain('Secure');
    } finally {
      await production.close();
    }
  });
  it('rate limits repeated failed sign-ins', async () => {
    const limited = await createApp(config, db);
    try {
      const agent = request.agent(limited.app);
      for (let i = 0; i < 10; i++)
        expect((await signIn(agent, email, 'invalid-password')).status).toBe(401);
      const response = await signIn(agent, email, 'invalid-password');
      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    } finally {
      await limited.close();
    }
  });
});
