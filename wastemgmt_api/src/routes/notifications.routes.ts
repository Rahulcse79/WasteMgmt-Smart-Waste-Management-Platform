import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotificationModel } from '../models/Notification.js';
import { NotificationService } from '../services/notification.service.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parsePage, buildEnvelope } from '../utils/pagination.js';

const MarkReadSchema = z.object({
  ids: z.array(z.string()).max(500).default([]),
});

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notifications', { preHandler: requireAuth }, async (req) => {
    const q = req.query as { unread?: string; limit?: string };
    const p = parsePage(req);
    if (p.legacy) {
      return NotificationService.list(req.user!.sub, {
        unreadOnly: q.unread === 'true',
        limit: q.limit ? Math.max(1, Math.min(200, Number(q.limit))) : 50,
      });
    }
    const filter: Record<string, unknown> = { userId: req.user!.sub };
    if (q.unread === 'true') filter.read = false;
    const [items, total] = await Promise.all([
      NotificationModel.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
      p.skipTotal ? Promise.resolve(-1) : NotificationModel.countDocuments(filter),
    ]);
    return buildEnvelope(items, total, p);
  });

  app.get('/notifications/unread-count', { preHandler: requireAuth }, async (req) => ({
    count: await NotificationService.unreadCount(req.user!.sub),
  }));

  app.post(
    '/notifications/mark-read',
    { preHandler: [requireAuth, validateBody(MarkReadSchema)] },
    async (req) => {
      const body = req.body as z.infer<typeof MarkReadSchema>;
      const n = await NotificationService.markRead(req.user!.sub, body.ids);
      return { ok: true, modified: n };
    }
  );
}
