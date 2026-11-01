import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';

/** Only operator-safe fields; never raw paths, queries, bodies, headers or error objects. */
export function requestLogging(enabled: boolean): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.locals.requestId = requestId;
    const start = performance.now();
    res.once('finish', () => {
      if (!enabled) return;
      const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
      console.info(
        JSON.stringify({
          event: 'http.request',
          requestId,
          method: req.method,
          route,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - start),
        }),
      );
    });
    next();
  };
}
