import type { FastifyInstance } from 'fastify';
import { AnalyticsService } from '../services/analytics.service.js';
import { requireAuth } from '../middleware/auth.js';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/analytics/dashboard', { preHandler: requireAuth }, async () =>
    AnalyticsService.dashboard()
  );

  app.get<{ Params: { id: string } }>(
    '/analytics/dustbins/:id/fill-trend',
    { preHandler: requireAuth },
    async (req) => {
      const q = req.query as { hours?: string };
      const hours = Math.max(1, Math.min(168, Number(q.hours) || 24));
      const trend = await AnalyticsService.fillTrend(req.params.id, hours);
      return { dustbinId: req.params.id, hours, points: trend };
    }
  );
}
