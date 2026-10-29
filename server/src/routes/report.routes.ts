import { Router } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requirePermission } from '../middleware/auth.js';
import { reportData, reportCsv, reportKinds } from '../services/report.service.js';
export function reportRoutes(db: PrismaClient) {
  const router = Router();
  for (const kind of reportKinds) {
    const permission =
      kind === 'milestones'
        ? 'milestones:read'
        : kind === 'transactions'
          ? 'transactions:read'
          : 'expenses:read';
    router.get(`/${kind}/export`, requirePermission(permission), async (req, res) => {
      const data = await db.$transaction((tx) => reportData(tx, kind, req.query, req.user!, true), {
        isolationLevel: 'RepeatableRead',
      });
      res.type('text/csv').attachment(`viotechpm-${kind}.csv`).send(reportCsv(kind, data.items));
    });
    router.get(`/${kind}`, requirePermission(permission), async (req, res) => {
      const data = await db.$transaction((tx) => reportData(tx, kind, req.query, req.user!), {
        isolationLevel: 'RepeatableRead',
      });
      res.json({ data });
    });
  }
  return router;
}
