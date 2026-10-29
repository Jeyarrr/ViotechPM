import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../utils/errors.js';

export function protectMutations(origin: string | string[]): RequestHandler {
  const allowedOrigins = Array.isArray(origin) ? origin : [origin];
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!allowedOrigins.includes(req.get('origin') ?? ''))
      throw new AppError(403, 'INVALID_ORIGIN', 'This request origin is not allowed.');
    const fileUpload =
      req.method === 'POST' &&
      /^\/api\/projects\/[0-9a-f-]{36}\/documents$/i.test(req.path) &&
      req.is('application/octet-stream');
    if (!req.is('application/json') && !fileUpload)
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send application/json.');
    const actual = req.get('x-csrf-token');
    const expected = req.session.csrfToken;
    if (
      !actual ||
      !expected ||
      !/^[a-f0-9]{64}$/.test(actual) ||
      actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    ) {
      throw new AppError(
        403,
        'INVALID_CSRF',
        'Your security session changed. Please refresh and try again.',
      );
    }
    next();
  };
}
