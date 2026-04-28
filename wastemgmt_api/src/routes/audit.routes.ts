import type { FastifyInstance } from 'fastify';
import { AuditLogModel } from '../models/AuditLog.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

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
}
