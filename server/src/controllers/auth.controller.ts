import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AuthService } from '../services/auth.service.js';
import { loginSchema } from '../validators/auth.js';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

export const cookieName = 'viotechpm.sid';
export function authController(
  auth: AuthService,
  db: PrismaClient,
  secure: boolean,
  sameSite: 'lax' | 'none' = 'lax',
) {
  const csrf: RequestHandler = (req, res) => {
    req.session.csrfToken ??= randomBytes(32).toString('hex');
    res.json({ data: { csrfToken: req.session.csrfToken } });
  };
  const login: RequestHandler = async (req, res) => {
    if (
      secure &&
      typeof req.body?.email === 'string' &&
      req.body.email.trim().toLowerCase() === 'admin'
    )
      throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
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
    res.clearCookie(cookieName, { httpOnly: true, sameSite, secure, path: '/' });
    if (id)
      await db.auditLog.create({
        data: { actorId: id, action: 'auth.logout', entityType: 'User', entityId: id },
      });
    res.json({ data: { message: 'Signed out successfully.' } });
  };
  const me: RequestHandler = (req, res) => {
    res.json({ data: { user: req.user } });
  };
  const changePassword: RequestHandler = async (req, res) => {
    const input = z
      .object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(16).max(128),
      })
      .strict()
      .parse(req.body);
    await auth.changePassword(req.user!.id, input.currentPassword, input.newPassword);
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    res.clearCookie(cookieName, { httpOnly: true, sameSite, secure, path: '/' });
    res.json({ data: { message: 'Password updated. Sign in again on each device.' } });
  };
  return { csrf, login, logout, me, changePassword };
}
