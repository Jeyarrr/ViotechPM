import type { Server as HttpServer } from 'node:http';
import type { Request, RequestHandler } from 'express';
import { Server, type Socket } from 'socket.io';
import pg from 'pg';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AuthService } from './auth.service.js';
import { projectScope } from './project.service.js';
import { taskScope } from './task.service.js';
import { notificationScope } from './notification.service.js';
import { transactionScope } from './transaction.service.js';
import { financialProjectScope } from './expense.service.js';

export function createRealtime(
  http: HttpServer,
  middleware: RequestHandler,
  origins: string[],
  db: PrismaClient,
  auth: AuthService,
  databaseUrl: string,
) {
  const io = new Server(http, {
    cors: { origin: origins, credentials: true },
    allowRequest: (req, done) => done(null, origins.includes(req.headers.origin ?? '')),
    maxHttpBufferSize: 8192,
  });
  io.engine.use(middleware);
  async function identity(socket: Socket, reload = true) {
    const req = socket.request as Request;
    if (reload)
      await new Promise<void>((resolve, reject) =>
        req.session.reload((err) => (err ? reject(err) : resolve())),
      );
    if (
      !req.session.userId ||
      !req.session.authenticatedAt ||
      Date.now() - req.session.authenticatedAt >= 8 * 60 * 60 * 1000
    )
      throw new Error('Sign in required.');
    const user = await auth.currentUser(req.session.userId);
    if (!user) throw new Error('Sign in required.');
    return user;
  }
  async function revalidate(socket: Socket) {
    try {
      const user = await identity(socket);
      for (const room of socket.rooms) {
        if (
          room.startsWith('project:') &&
          !(await db.project.count({ where: { id: room.slice(8), ...projectScope(user) } }))
        )
          await socket.leave(room);
        if (
          room.startsWith('task:') &&
          !(await db.task.count({ where: { id: room.slice(5), ...taskScope(user) } }))
        )
          await socket.leave(room);
      }
      return user;
    } catch {
      socket.disconnect(true);
      return null;
    }
  }
  io.use(async (socket, next) => {
    try {
      const user = await identity(socket, false);
      const req = socket.request as Request;
      if (socket.handshake.auth.csrfToken !== req.session.csrfToken || !req.session.csrfToken)
        throw new Error('Security session required.');
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('Please sign in to connect.'));
    }
  });
  io.on('connection', (socket) => {
    void socket.join(`user:${socket.data.userId}`);
    let lastSubscription = 0;
    socket.on('subscribe', async (input, ack) => {
      if (typeof ack !== 'function') return;
      if (Date.now() - lastSubscription < 100) return ack({ ok: false });
      lastSubscription = Date.now();
      const parsed = z
        .object({ kind: z.enum(['project', 'task']), id: z.uuid() })
        .strict()
        .safeParse(input);
      if (!parsed.success || socket.rooms.size >= 12) return ack({ ok: false });
      const user = await revalidate(socket);
      if (!user) return ack({ ok: false });
      try {
        const { kind, id } = parsed.data;
        const count =
          kind === 'project'
            ? await db.project.count({ where: { id, ...projectScope(user) } })
            : await db.task.count({ where: { id, ...taskScope(user) } });
        if (!count) return ack({ ok: false });
        await socket.join(`${kind}:${id}`);
        ack({ ok: true });
      } catch {
        ack({ ok: false });
      }
    });
    socket.on('unsubscribe', (input) => {
      const parsed = z
        .object({ kind: z.enum(['project', 'task']), id: z.uuid() })
        .strict()
        .safeParse(input);
      if (parsed.success) void socket.leave(`${parsed.data.kind}:${parsed.data.id}`);
    });
  });
  const authTimer = setInterval(() => {
    for (const socket of io.sockets.sockets.values()) void revalidate(socket);
  }, 30_000);
  authTimer.unref();
  let listener: pg.Client | undefined;
  let retry: NodeJS.Timeout | undefined;
  let stopped = false;
  let chain = Promise.resolve();
  async function dispatch(payload: string) {
    const parsed = z
      .object({ table: z.enum(['notifications', 'audit_logs']), id: z.uuid() })
      .safeParse(JSON.parse(payload));
    if (!parsed.success) return;
    const event = parsed.data;
    if (event.table === 'notifications') {
      const item = await db.notification.findUnique({ where: { id: event.id } });
      if (!item) return;
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.userId !== item.recipientId) continue;
        const user = await revalidate(socket);
        if (
          user &&
          (await db.notification.count({ where: { id: item.id, ...notificationScope(user) } }))
        )
          socket.emit('notifications:changed');
      }
    } else {
      const eventRow = await db.auditLog.findUnique({ where: { id: event.id } });
      // Membership/account changes also revoke rooms before any future delivery.
      for (const socket of io.sockets.sockets.values()) {
        const user = await revalidate(socket);
        if (!user || !eventRow?.projectId) continue;
        if (!(await db.project.count({ where: { id: eventRow.projectId, ...projectScope(user) } })))
          continue;
        if (
          eventRow.entityType === 'Task' &&
          !(await db.task.count({ where: { id: eventRow.entityId!, ...taskScope(user) } }))
        )
          continue;
        if (
          eventRow.entityType === 'ProjectTransaction' &&
          !(await db.projectTransaction.count({
            where: { id: eventRow.entityId!, ...transactionScope(user) },
          }))
        )
          continue;
        if (
          eventRow.entityType === 'Expense' &&
          !(await db.project.count({
            where: { id: eventRow.projectId, ...financialProjectScope(user) },
          }))
        )
          continue;
        // Only invalidation hints, never audit metadata or financial payloads.
        socket.emit('workspace:changed', {
          projectId: eventRow.projectId,
          entityType: eventRow.entityType,
        });
      }
    }
  }
  async function connect() {
    if (stopped) return;
    const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    listener = client;
    const reconnect = () => {
      if (stopped || retry) return;
      void client.end().catch(() => undefined);
      retry = setTimeout(() => {
        retry = undefined;
        void connect();
      }, 5000);
      retry.unref();
    };
    client.on('error', reconnect);
    client.on('end', reconnect);
    client.on('notification', (message) => {
      if (message.payload)
        chain = chain
          .then(() => dispatch(message.payload!))
          .catch(() => {
            console.error('Realtime event delivery failed; persistent records remain available.');
          });
    });
    try {
      await client.connect();
      await client.query('LISTEN viotech_events');
    } catch {
      reconnect();
    }
  }
  void connect();
  return {
    io,
    async close() {
      stopped = true;
      clearInterval(authTimer);
      if (retry) clearTimeout(retry);
      await listener?.end().catch(() => undefined);
      await chain;
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
