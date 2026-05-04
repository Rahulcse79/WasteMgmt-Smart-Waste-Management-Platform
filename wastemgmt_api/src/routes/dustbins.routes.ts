import type { FastifyInstance } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { DustbinModel } from '../models/Dustbin.js';
import { DustbinService } from '../services/dustbin.service.js';
import { PredictionService } from '../services/prediction.service.js';
import { UserModel } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AuditService } from '../services/audit.service.js';
import { parsePage, buildEnvelope } from '../utils/pagination.js';

/** Build a regex-anchored case-insensitive search across the obvious fields. */
function searchClause(q: string | undefined): Record<string, unknown> | null {
  const term = (q ?? '').trim();
  if (!term) return null;
  // Escape regex specials so a search for `a.b` doesn't mean `a<any>b`.
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(safe, 'i');
  return { $or: [{ dustbinId: rx }, { dustbinName: rx }, { zone: rx }] };
}

// NOTE: tenantId is intentionally NOT accepted from the client — it is derived
// from the authenticated user. Accepting it would let an authenticated admin
// of one tenant write into another tenant's namespace.
const UpsertSchema = z.object({
  dustbinId: z.string().min(1),
  dustbinName: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  zone: z.string().optional(),
});

const PartialUpsertSchema = UpsertSchema.partial();

// All authenticated users currently belong to the 'default' tenant. Centralised
// here so a future multi-tenant migration only touches one place.
function tenantOf(_user: { sub: string; role: string }): string {
  return 'default';
}

export async function dustbinRoutes(app: FastifyInstance): Promise<void> {
  // List. Backward compatible: with no `page` query the legacy array shape is
  // returned (the dashboard map and CSV exports still need the full list).
  // With `?page=N` the envelope `{ items, total, page, pageSize, totalPages }`
  // is returned for the admin grid.
  app.get('/dustbins', { preHandler: requireAuth }, async (req) => {
    const q = req.query as { q?: string; zone?: string; status?: string };
    let scope: string[] | null = null;
    if (req.user!.role === 'user') {
      const u = await UserModel.findById(req.user!.sub).select('assignedDustbins').lean();
      scope = u?.assignedDustbins ?? [];
      if (scope.length === 0) {
        const p = parsePage(req);
        return p.legacy ? [] : buildEnvelope([], 0, p);
      }
    }

    const filter: Record<string, unknown> = { isActive: true };
    if (scope) filter.dustbinId = { $in: scope };
    if (q.zone) filter.zone = q.zone;
    if (q.status === 'online') filter.online = true;
    if (q.status === 'offline') filter.online = false;
    const search = searchClause(q.q);
    if (search) Object.assign(filter, search);

    const p = parsePage(req);
    if (p.legacy) {
      // Old behaviour: return everything matching the filter, capped at the
      // service's natural ceiling. The dashboard relies on this for the map.
      return DustbinModel.find(filter).sort({ dustbinId: 1 }).lean();
    }
    const [items, total] = await Promise.all([
      DustbinModel.find(filter).sort({ dustbinId: 1 }).skip(p.skip).limit(p.pageSize).lean(),
      p.skipTotal ? Promise.resolve(-1) : DustbinModel.countDocuments(filter),
    ]);
    return buildEnvelope(items, total, p);
  });

  // Get one
  app.get<{ Params: { id: string } }>(
    '/dustbins/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const doc = await DustbinService.getById(req.params.id);
      if (!doc) return reply.code(404).send({ error: 'Not found' });
      if (req.user!.role === 'user') {
        const u = await UserModel.findById(req.user!.sub).select('assignedDustbins').lean();
        if (u && u.assignedDustbins.length > 0 && !u.assignedDustbins.includes(req.params.id)) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
      }
      return doc;
    }
  );

  // Predict next-full ETA (admin or user assigned to this bin)
  app.get<{ Params: { id: string } }>(
    '/dustbins/:id/predict',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.user!.role === 'user') {
        const u = await UserModel.findById(req.user!.sub).select('assignedDustbins').lean();
        if (!u || (u.assignedDustbins.length > 0 && !u.assignedDustbins.includes(req.params.id))) {
          return reply.code(403).send({ error: 'Forbidden' });
        }
      }
      return PredictionService.predictBinFullAt(req.params.id);
    }
  );

  // Create / upsert (admin only)
  app.post(
    '/dustbins',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(UpsertSchema)] },
    async (req) => {
      const body = req.body as z.infer<typeof UpsertSchema>;
      const doc = await DustbinService.upsert({ ...body, tenantId: tenantOf(req.user!) });
      await AuditService.log({
        actor: req.user,
        action: 'DUSTBIN_UPSERT',
        resource: 'dustbin',
        resourceId: body.dustbinId,
        diff: body,
        ip: req.ip,
      });
      return doc;
    }
  );

  // Partial update — true PATCH semantics. Missing fields are LEFT ALONE,
  // never overwritten with empty defaults. (Was a data-loss bug previously.)
  app.put<{ Params: { id: string } }>(
    '/dustbins/:id',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(PartialUpsertSchema)] },
    async (req, reply) => {
      const body = req.body as z.infer<typeof PartialUpsertSchema>;
      const $set: Record<string, unknown> = {};
      if (body.dustbinName !== undefined) $set.dustbinName = body.dustbinName;
      if (body.latitude !== undefined) $set.latitude = body.latitude;
      if (body.longitude !== undefined) $set.longitude = body.longitude;
      if (body.zone !== undefined) $set.zone = body.zone;
      if (Object.keys($set).length === 0) {
        return reply.code(400).send({ error: 'no fields to update' });
      }
      const doc = await DustbinModel.findOneAndUpdate(
        { dustbinId: req.params.id, isActive: true, tenantId: tenantOf(req.user!) },
        { $set },
        { new: true }
      ).lean();
      if (!doc) return reply.code(404).send({ error: 'not found' });
      await AuditService.log({
        actor: req.user,
        action: 'DUSTBIN_UPDATE',
        resource: 'dustbin',
        resourceId: req.params.id,
        diff: $set,
        ip: req.ip,
      });
      return doc;
    }
  );

  // Delete
  app.delete<{ Params: { id: string } }>(
    '/dustbins/:id',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (req) => {
      await DustbinService.softDelete(req.params.id);
      await AuditService.log({
        actor: req.user,
        action: 'DUSTBIN_DELETE',
        resource: 'dustbin',
        resourceId: req.params.id,
        ip: req.ip,
      });
      return { ok: true };
    }
  );
}
