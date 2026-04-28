import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DustbinService, type Metric } from '../services/dustbin.service.js';
import { RulesService } from '../services/rules.service.js';
import { wsHub } from '../services/ws.service.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const IngestSchema = z.object({
  dustbinId: z.string().min(1),
  timestamp: z.string().datetime().optional(),
  readings: z.object({
    depth: z.number().optional(),
    gas: z.number().optional(),
    humidity: z.number().optional(),
    temperature: z.number().optional(),
  }),
});

/**
 * Manual ingest endpoint — useful for testing or for devices that cannot use MQTT.
 * Admin-only to avoid abuse; in production prefer MQTT.
 */
export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/ingest',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(IngestSchema)] },
    async (req) => {
      const body = req.body as z.infer<typeof IngestSchema>;
      const ts = body.timestamp ? new Date(body.timestamp) : new Date();
      await DustbinService.ingestBulkReadings({
        dustbinId: body.dustbinId,
        timestamp: ts,
        readings: body.readings,
      });
      wsHub.broadcast(`dustbin:${body.dustbinId}`, 'reading', {
        dustbinId: body.dustbinId,
        timestamp: ts,
        metrics: body.readings,
      });
      await Promise.all(
        (Object.entries(body.readings) as Array<[Metric, number]>)
          .filter(([, v]) => typeof v === 'number')
          .map(([m, v]) => RulesService.evaluate({ dustbinId: body.dustbinId, metric: m, value: v }))
      );
      return { ok: true };
    }
  );
}
