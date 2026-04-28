import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DustbinService } from '../services/dustbin.service.js';
import { PredictionService } from '../services/prediction.service.js';
import { UserModel } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AuditService } from '../services/audit.service.js';

const UpsertSchema = z.object({
  dustbinId: z.string().min(1),
  dustbinName: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  tenantId: z.string().optional(),
  zone: z.string().optional(),
});

export async function dustbinRoutes(app: FastifyInstance): Promise<void> {
  // List
  app.get('/dustbins', { preHandler: requireAuth }, async (req) => {
    if (req.user!.role === 'user') {
      const u = await UserModel.findById(req.user!.sub).select('assignedDustbins').lean();
      const ids = u?.assignedDustbins ?? [];
      if (ids.length === 0) return [];
      return DustbinService.list({ assignedIds: ids });
    }
    return DustbinService.list();
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

  // Predict next-full ETA (admin or assigned user)
  app.get<{ Params: { id: string } }>(
    '/dustbins/:id/predict',
    { preHandler: requireAuth },
    async (req) => PredictionService.predictBinFullAt(req.params.id)
  );

  // Create / upsert
  app.post(
    '/dustbins',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(UpsertSchema)] },
    async (req) => {
      const body = req.body as z.infer<typeof UpsertSchema>;
      const doc = await DustbinService.upsert(body);
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

  // Update
  app.put<{ Params: { id: string } }>(
    '/dustbins/:id',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(UpsertSchema.partial().extend({ dustbinId: z.string().optional() }))] },
    async (req) => {
      const body = req.body as Partial<z.infer<typeof UpsertSchema>>;
      const doc = await DustbinService.upsert({
        dustbinId: req.params.id,
        dustbinName: body.dustbinName ?? '',
        latitude: body.latitude ?? 0,
        longitude: body.longitude ?? 0,
        tenantId: body.tenantId,
        zone: body.zone,
      });
      await AuditService.log({
        actor: req.user,
        action: 'DUSTBIN_UPDATE',
        resource: 'dustbin',
        resourceId: req.params.id,
        diff: body,
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
