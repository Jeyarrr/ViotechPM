import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AuthService } from '../services/auth.service.js';
import { loginSchema } from '../validators/auth.js';

export const cookieName = 'viotechpm.sid';
export function authController(auth: AuthService, db: PrismaClient, secure: boolean) {
  const csrf: RequestHandler = (req, res) => {
    req.session.csrfToken ??= randomBytes(32).toString('hex');
    res.json({ data: { csrfToken: req.session.csrfToken } });
  };
  const login: RequestHandler = async (req, res) => {
    const input = loginSchema.parse(req.body);
    const id = await auth.authenticate(input.email, input.password);
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.userId = id;
    req.session.authenticatedAt = Date.now();
    req.session.csrfToken = randomBytes(32).toString('hex');
    const user = await auth.recordLogin(id);
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );
    res.json({ data: { user } });
  };
  const logout: RequestHandler = async (req, res) => {
    const id = req.session.userId;
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve())),
    );
    res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
    if (id)
      await db.auditLog.create({
        data: { actorId: id, action: 'auth.logout', entityType: 'User', entityId: id },
      });
    res.json({ data: { message: 'Signed out successfully.' } });
  };
  const me: RequestHandler = (req, res) => {
    res.json({ data: { user: req.user } });
  };
  return { csrf, login, logout, me };
}
