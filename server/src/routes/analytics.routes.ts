import { Router } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requirePermission } from '../middleware/auth.js';
import { operationalAnalytics, analyticsFilters } from '../services/analytics.service.js';

export function analyticsRoutes(db: PrismaClient) {
  const router = Router();
  router.use(requirePermission('analytics:read'));
  for (const kind of ['', 'projects', 'tasks', 'milestones', 'workload', 'project-health'] as const)
    router.get(`/${kind}`, async (req, res) => {
      const result = await operationalAnalytics(db, req.user!, analyticsFilters.parse(req.query));
      res.json({
        data: kind === '' ? result : kind === 'project-health' ? result.health : result[kind],
      });
    });
  return router;
}
