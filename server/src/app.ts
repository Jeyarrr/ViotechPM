import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient } from './generated/prisma/client.js';
import type { AppConfig } from './config/env.js';
import { createAuthService } from './services/auth.service.js';
import { cookieName } from './controllers/auth.controller.js';
import { authRoutes } from './routes/auth.routes.js';
import { protectMutations } from './middleware/security.js';
import { requireAuth, requirePermission } from './middleware/auth.js';
import { errorHandler } from './middleware/error.js';
import { overviewData } from './services/dashboard.service.js';
import { clientRoutes } from './routes/client.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { lookupRoutes, categoryRoutes, transactionTypeRoutes } from './routes/lookup.routes.js';
import { employeeRoutes } from './routes/employee.routes.js';
import { taskRoutes } from './routes/task.routes.js';
import { milestoneRoutes } from './routes/milestone.routes.js';
import { transactionRoutes } from './routes/transaction.routes.js';
import { approvalRoutes } from './routes/approval.routes.js';
import { expenseRoutes } from './routes/expense.routes.js';

export async function createApp(config: AppConfig, db: PrismaClient) {
  const app = express();
  const auth = await createAuthService(db);
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    max: 10,
  });
  pool.on('error', () => console.error('Session database connection error.'));
  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    pool,
    tableName: 'sessions',
    createTableIfMissing: false,
    pruneSessionInterval: 900,
  });
  const secure = config.NODE_ENV === 'production';
  app.disable('x-powered-by');
  if (config.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.CLIENT_ORIGIN,
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 150,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
      },
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ data: { status: 'ok', database: 'connected' } });
    } catch {
      res
        .status(503)
        .json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' } });
    }
  });
  app.use(
    session({
      name: cookieName,
      secret: config.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: false,
      cookie: { httpOnly: true, secure, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000, path: '/' },
    }),
  );
  app.use(protectMutations(config.CLIENT_ORIGIN));
  app.use('/api/auth', authRoutes(auth, db, secure));
  app.use('/api/clients', requireAuth(auth), clientRoutes(db));
  app.use('/api/projects', requireAuth(auth), projectRoutes(db));
  app.use('/api/lookups', requireAuth(auth), lookupRoutes(db));
  app.use('/api/project-categories', requireAuth(auth), categoryRoutes(db));
  app.use('/api/employees', requireAuth(auth), employeeRoutes(db));
  app.use('/api/tasks', requireAuth(auth), taskRoutes(db));
  app.use('/api/milestones', requireAuth(auth), milestoneRoutes(db));
  app.use('/api/transactions', requireAuth(auth), transactionRoutes(db));
  app.use('/api/approvals', requireAuth(auth), approvalRoutes(db));
  app.use('/api/transaction-types', requireAuth(auth), transactionTypeRoutes(db));
  app.use('/api/expenses', requireAuth(auth), expenseRoutes(db));
  app.get(
    '/api/dashboard',
    requireAuth(auth),
    requirePermission('overview:read'),
    async (req, res) => {
      res.json({ data: await overviewData(db, req.user!) });
    },
  );
  // A real authorization boundary for the system foundation; no settings CRUD in Phase 1.
  app.get(
    '/api/system/access',
    requireAuth(auth),
    requirePermission('system:manage'),
    (req, res) => {
      res.json({ data: { permissions: req.user!.permissions, phase: 1 } });
    },
  );
  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'This endpoint does not exist.' } }),
  );
  app.use(errorHandler);
  return {
    app,
    async close() {
      store.close();
      await pool.end();
    },
  };
}
