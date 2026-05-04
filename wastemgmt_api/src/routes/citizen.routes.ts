import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CitizenReportModel } from '../models/CitizenReport.js';
import { NotificationService } from '../services/notification.service.js';
import { UserModel } from '../models/User.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AuditService } from '../services/audit.service.js';
import { parsePage, buildEnvelope } from '../utils/pagination.js';

const SubmitSchema = z.object({
  dustbinId: z.string().trim().max(64).optional(),
  description: z.string().trim().min(5).max(1000),
  category: z.enum(['OVERFLOW', 'DAMAGE', 'BAD_SMELL', 'MISSING', 'OTHER']).default('OVERFLOW'),
  photoUrl: z.string().url().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  contactName: z.string().trim().max(80).optional(),
  contactEmail: z.string().email().max(120).optional(),
  contactPhone: z.string().trim().max(32).optional(),
  /** Honeypot field — bots fill this in, humans never will. */
  website: z.string().max(0).optional(),
});

const UpdateStatusSchema = z.object({
  status: z.enum(['NEW', 'TRIAGED', 'RESOLVED', 'REJECTED']),
  note: z.string().trim().max(500).optional(),
});

export async function citizenRoutes(app: FastifyInstance): Promise<void> {
  // ── Public: submit a report ──────────────────────────────────────────
  app.post(
    '/public/citizen-reports',
    {
      // Tighter rate limit on public endpoint to deter spam.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      preHandler: validateBody(SubmitSchema),
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof SubmitSchema>;
      if (body.website && body.website.length > 0) {
        // Honeypot: pretend success to avoid signalling to bot.
        return reply.code(202).send({ ok: true });
      }
      const doc = await CitizenReportModel.create({
        ...body,
        ip: req.ip,
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
      });

      // Notify all admins.
      const admins = await UserModel.find({ role: 'admin', isActive: true })
        .select('_id')
        .lean();
      void NotificationService.fanOut(
        admins.map((a) => String(a._id)),
        {
          title: 'New citizen report',
          body: body.description.slice(0, 140),
          severity: 'warning',
          category: 'CITIZEN',
          link: `/admin/reports/${doc.id}`,
          metadata: { reportId: doc.id, category: body.category },
        }
      ).catch(() => undefined);

      return reply.code(201).send({ ok: true, id: doc.id });
    }
  );

  // ── Admin: list/update reports ───────────────────────────────────────
  app.get(
    '/citizen-reports',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (req) => {
      const q = req.query as { status?: string; category?: string; q?: string; limit?: string };
      const filter: Record<string, unknown> = {};
      if (q.status) filter.status = q.status;
      if (q.category) filter.category = q.category;
      if (q.q && q.q.trim()) {
        const safe = q.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(safe, 'i');
        filter.$or = [{ description: rx }, { dustbinId: rx }, { contactName: rx }, { contactEmail: rx }];
      }
      const p = parsePage(req);
      if (p.legacy) {
        const limit = Math.max(1, Math.min(500, Number(q.limit) || 100));
        return CitizenReportModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
      }
      const [items, total] = await Promise.all([
        CitizenReportModel.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
        p.skipTotal ? Promise.resolve(-1) : CitizenReportModel.countDocuments(filter),
      ]);
      return buildEnvelope(items, total, p);
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/citizen-reports/:id',
    {
      preHandler: [requireAuth, requireRole('admin'), validateBody(UpdateStatusSchema)],
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof UpdateStatusSchema>;
      const updated = await CitizenReportModel.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            status: body.status,
            handledBy: req.user?.username ?? '',
            handledAt: new Date(),
          },
        },
        { new: true }
      ).lean();
      if (!updated) return reply.code(404).send({ error: 'not_found' });
      await AuditService.log({
        actor: req.user,
        action: 'CITIZEN_REPORT_UPDATE',
        resource: 'citizenReport',
        resourceId: req.params.id,
        diff: { status: body.status, note: body.note },
        ip: req.ip,
      });
      return updated;
    }
  );
}
