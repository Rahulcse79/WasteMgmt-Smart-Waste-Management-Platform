import type { FastifyInstance } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { AlertModel } from '../models/Alert.js';
import { AlertService } from '../services/alert.service.js';
import { requireAuth } from '../middleware/auth.js';
import { parsePage, buildEnvelope } from '../utils/pagination.js';

const ListQuerySchema = z.object({
  acknowledged: z.enum(['true', 'false']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  type: z.string().min(1).max(64).optional(),
  dustbinId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function alertRoutes(app: FastifyInstance): Promise<void> {
  app.get('/alerts', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = ListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query', issues: parsed.error.issues });
    const { acknowledged, severity, type, dustbinId, limit } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (acknowledged === 'true') filter.acknowledged = true;
    if (acknowledged === 'false') filter.acknowledged = false;
    if (severity) filter.severity = severity;
    if (type) filter.type = type;
    if (dustbinId) filter.dustbinId = dustbinId;

    const p = parsePage(req);
    if (p.legacy) {
      // Preserve the existing array contract for callers that don't paginate.
      return AlertService.list({
        acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
        limit: limit ?? 100,
      });
    }
    const [items, total] = await Promise.all([
      AlertModel.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
      p.skipTotal ? Promise.resolve(-1) : AlertModel.countDocuments(filter),
    ]);
    return buildEnvelope(items, total, p);
  });

  app.post<{ Params: { id: string } }>(
    '/alerts/:id/ack',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!isValidObjectId(req.params.id)) {
        return reply.code(400).send({ error: 'invalid id' });
      }
      await AlertService.acknowledge(req.params.id, req.user!.username);
      return { ok: true };
    }
  );
}
