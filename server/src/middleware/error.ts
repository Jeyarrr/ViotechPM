import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { Prisma } from '../generated/prisma/client.js';

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  void _next; // Four arguments are required for Express to identify error middleware.
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted fields.',
        fields: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const known: Record<string, [number, string]> = {
      P2002: [409, 'A record with this code or email already exists.'],
      P2003: [422, 'A related record is unavailable. Please review your selections.'],
      P2025: [404, 'This record is unavailable.'],
      P2034: [409, 'This record changed during your request. Please refresh and try again.'],
    };
    const result = known[err.code];
    if (result) {
      res.status(result[0]).json({ error: { code: err.code, message: result[1] } });
      return;
    }
  }
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
    return;
  }
  if (typeof err === 'object' && err !== null && 'status' in err && err.status === 413) {
    res
      .status(413)
      .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' } });
    return;
  }
  // Deliberately omit raw errors: database drivers may include connection credentials.
  console.error('Request failed with an unexpected server error.');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
};
