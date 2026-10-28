import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AuthService } from '../services/auth.service.js';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

export function authRoutes(auth: AuthService, db: PrismaClient, secure: boolean) {
  const router = Router();
  const controller = authController(auth, db, secure);
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many sign-in attempts. Please try again in 15 minutes.',
      },
    },
  });
  router.get('/csrf', controller.csrf);
  router.post('/login', limiter, controller.login);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth(auth), controller.me);
  return router;
}
