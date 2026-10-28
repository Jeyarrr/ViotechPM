import 'express-session';
import type { PublicUser } from '../services/auth.service.js';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    authenticatedAt?: number;
    csrfToken?: string;
  }
}
declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}
