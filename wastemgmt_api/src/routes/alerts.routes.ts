import type { FastifyInstance } from 'fastify';
import { AlertService } from '../services/alert.service.js';
import { requireAuth } from '../middleware/auth.js';

export async function alertRoutes(app: FastifyInstance): Promise<void> {
  app.get('/alerts', { preHandler: requireAuth }, async (req) => {
    const q = req.query as { acknowledged?: string; limit?: string };
    return AlertService.list({
      acknowledged: q.acknowledged === 'true' ? true : q.acknowledged === 'false' ? false : undefined,
      limit: q.limit ? Number(q.limit) : 100,
    });
  });

  app.post<{ Params: { id: string } }>(
    '/alerts/:id/ack',
    { preHandler: requireAuth },
    async (req) => {
      await AlertService.acknowledge(req.params.id, req.user!.username);
      return { ok: true };
    }
  );
}
