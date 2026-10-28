import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { Permission } from '../config/permissions.js';
import { AppError } from '../utils/errors.js';

export function requireAuth(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const withinLifetime =
      typeof req.session.authenticatedAt === 'number' &&
      Date.now() - req.session.authenticatedAt < 8 * 60 * 60 * 1000;
    const user =
      req.session.userId && withinLifetime ? await auth.currentUser(req.session.userId) : null;
    if (!user) {
      if (req.session.userId) {
        await new Promise<void>((resolve, reject) =>
          req.session.destroy((err) => (err ? reject(err) : resolve())),
        );
      }
      throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    }
    req.user = user;
    next();
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    if (!req.user.permissions.includes(permission))
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource.');
    next();
  };
}
