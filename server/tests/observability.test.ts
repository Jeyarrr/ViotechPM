import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestLogging } from '../src/middleware/observability.js';

describe('request correlation', () => {
  it('generates IDs and logs templates without confidential input', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const app = express();
      app.use(requestLogging(true));
      app.get('/record/:id', (_req, res) => res.json({ ok: true }));
      const response = await request(app)
        .get('/record/private-id?secret=private-query')
        .set('X-Request-ID', 'untrusted-id')
        .set('Cookie', 'session=private-cookie')
        .expect(200);
      expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
      const line = String(log.mock.calls[0]![0]);
      expect(JSON.parse(line).route).toBe('/record/:id');
      for (const value of ['private-id', 'private-query', 'private-cookie', 'untrusted-id'])
        expect(line).not.toContain(value);
    } finally {
      log.mockRestore();
    }
  });
});
