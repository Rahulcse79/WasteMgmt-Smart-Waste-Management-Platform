import type { FastifyInstance } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { AuditLogModel } from '../models/AuditLog.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AuditService } from '../services/audit.service.js';
import { parsePage, buildEnvelope } from '../utils/pagination.js';

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  resource: z.string().min(1).max(64).optional(),
  action: z.string().min(1).max(64).optional(),
  q: z.string().min(1).max(120).optional(),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/audit', { preHandler: [requireAuth, requireRole('admin')] }, async (req, reply) => {
    const parsed = ListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query', issues: parsed.error.issues });
    const { limit, resource, action, q } = parsed.data;
    const filter: Record<string, unknown> = {};
    if (resource) filter.resource = resource;
    if (action) filter.action = action;
    if (q && q.trim()) {
      const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = [{ 'actor.username': rx }, { resourceId: rx }, { action: rx }];
    }
    const p = parsePage(req);
    if (p.legacy) {
      return AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit ?? 200)
        .lean();
    }
    const [items, total] = await Promise.all([
      AuditLogModel.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
      p.skipTotal ? Promise.resolve(-1) : AuditLogModel.countDocuments(filter),
    ]);
    return buildEnvelope(items, total, p);
  });

  app.delete<{ Params: { id: string } }>(
    '/audit/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (req, reply) => {
      if (!isValidObjectId(req.params.id)) {
        return reply.code(400).send({ error: 'invalid id' });
      }
      const existing = await AuditLogModel.findById(req.params.id).lean();
      if (!existing) return reply.code(404).send({ error: 'not found' });
      await AuditLogModel.deleteOne({ _id: req.params.id });
      await AuditService.log({
        actor: req.user,
        action: 'AUDIT_DELETE',
        resource: 'audit',
        resourceId: req.params.id,
        ip: req.ip,
      });
      return { ok: true };
    }
  );
}
