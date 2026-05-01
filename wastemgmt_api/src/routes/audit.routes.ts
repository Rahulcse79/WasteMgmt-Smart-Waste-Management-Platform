import type { FastifyInstance } from 'fastify';
import { AuditLogModel } from '../models/AuditLog.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AuditService } from '../services/audit.service.js';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/audit', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    const q = req.query as { limit?: string; resource?: string };
    const filter: Record<string, unknown> = {};
    if (q.resource) filter.resource = q.resource;
    return AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(q.limit ?? 200), 1000))
      .lean();
  });

  app.delete<{ Params: { id: string } }>(
    '/audit/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (req, reply) => {
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
