import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RuleModel } from '../models/Rule.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AuditService } from '../services/audit.service.js';
import { parsePage, buildEnvelope } from '../utils/pagination.js';

const RuleSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  metric: z.enum(['depth', 'gas', 'humidity', 'temperature']),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
  threshold: z.number(),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
  alertType: z.enum(['BIN_FULL', 'GAS_HIGH', 'TEMP_HIGH', 'OFFLINE', 'CUSTOM']).default('CUSTOM'),
  notifyEmail: z.boolean().default(false),
  cooldownSec: z.number().int().min(0).default(300),
  appliesToDustbinIds: z.array(z.string()).default([]),
});

export async function rulesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/rules', { preHandler: [requireAuth, requireRole('admin')] }, async (req) => {
    const q = req.query as { metric?: string; enabled?: string };
    const filter: Record<string, unknown> = {};
    if (q.metric) filter.metric = q.metric;
    if (q.enabled === 'true') filter.enabled = true;
    if (q.enabled === 'false') filter.enabled = false;
    const p = parsePage(req);
    if (p.legacy) return RuleModel.find(filter).sort({ createdAt: -1 }).lean();
    const [items, total] = await Promise.all([
      RuleModel.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
      p.skipTotal ? Promise.resolve(-1) : RuleModel.countDocuments(filter),
    ]);
    return buildEnvelope(items, total, p);
  });

  app.post(
    '/rules',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(RuleSchema)] },
    async (req) => {
      const body = req.body as z.infer<typeof RuleSchema>;
      const doc = await RuleModel.create(body);
      await AuditService.log({
        actor: req.user,
        action: 'RULE_CREATE',
        resource: 'rule',
        resourceId: doc.id,
        diff: body,
        ip: req.ip,
      });
      return doc;
    }
  );

  app.put<{ Params: { id: string } }>(
    '/rules/:id',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(RuleSchema.partial())] },
    async (req) => {
      const body = req.body as Partial<z.infer<typeof RuleSchema>>;
      const doc = await RuleModel.findByIdAndUpdate(req.params.id, { $set: body }, { new: true });
      await AuditService.log({
        actor: req.user,
        action: 'RULE_UPDATE',
        resource: 'rule',
        resourceId: req.params.id,
        diff: body,
        ip: req.ip,
      });
      return doc;
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/rules/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (req) => {
      await RuleModel.deleteOne({ _id: req.params.id });
      await AuditService.log({
        actor: req.user,
        action: 'RULE_DELETE',
        resource: 'rule',
        resourceId: req.params.id,
        ip: req.ip,
      });
      return { ok: true };
    }
  );
}
