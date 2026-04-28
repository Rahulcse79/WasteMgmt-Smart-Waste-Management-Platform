import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppConfigModel, CONFIG_KEYS } from '../models/AppConfig.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AuditService } from '../services/audit.service.js';

const SetSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  description: z.string().optional(),
});

export async function configRoutes(app: FastifyInstance): Promise<void> {
  /** Public-ish config exposed to authenticated users (camera URLs, thresholds, etc.) */
  app.get('/config/public', { preHandler: requireAuth }, async () => {
    const docs = await AppConfigModel.find({}).lean();
    const map: Record<string, unknown> = {};
    for (const d of docs) map[d.key] = d.value;

    // Camera list: prefer the dynamic `cameras` array; fall back to legacy single keys / env vars.
    let cameras: Array<{ name: string; url: string; enabled?: boolean }> = [];
    const dyn = map[CONFIG_KEYS.CAMERAS];
    if (Array.isArray(dyn)) {
      cameras = dyn
        .filter((c): c is { name?: string; url?: string; enabled?: boolean } => !!c && typeof c === 'object')
        .map((c, i) => ({
          name: typeof c.name === 'string' && c.name ? c.name : `Camera ${i + 1}`,
          url: typeof c.url === 'string' ? c.url : '',
          enabled: c.enabled !== false,
        }))
        .filter((c) => c.url.length > 0);
    } else {
      const legacy = [
        { name: 'Camera 1', url: String(map[CONFIG_KEYS.CAMERA_STREAM_1] ?? config.CAMERA_STREAM_1 ?? ''), enabled: true },
        { name: 'Camera 2', url: String(map[CONFIG_KEYS.CAMERA_STREAM_2] ?? config.CAMERA_STREAM_2 ?? ''), enabled: true },
      ].filter((c) => c.url.length > 0);
      cameras = legacy;
    }

    return {
      cameras,
      // Kept for backwards compatibility with older clients.
      camerasLegacy: {
        stream1: cameras[0]?.url ?? '',
        stream2: cameras[1]?.url ?? '',
      },
      mqtt: {
        brokerUrl: map[CONFIG_KEYS.MQTT_BROKER_URL] ?? `${config.MQTT_PROTOCOL}://${config.MQTT_HOST}:${config.MQTT_PORT}`,
        topic: map[CONFIG_KEYS.MQTT_TOPIC] ?? config.MQTT_TOPIC,
      },
      thresholds: map[CONFIG_KEYS.ALERT_THRESHOLDS] ?? { binFull: 80, gasHigh: 300 },
    };
  });

  app.get('/config', { preHandler: [requireAuth, requireRole('admin')] }, async () =>
    AppConfigModel.find({}).lean()
  );

  app.put(
    '/config',
    { preHandler: [requireAuth, requireRole('admin'), validateBody(SetSchema)] },
    async (req) => {
      const body = req.body as z.infer<typeof SetSchema>;
      const doc = await AppConfigModel.findOneAndUpdate(
        { key: body.key },
        { $set: { value: body.value, description: body.description, updatedBy: req.user!.username } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await AuditService.log({
        actor: req.user,
        action: 'CONFIG_UPDATE',
        resource: 'config',
        resourceId: body.key,
        diff: { key: body.key, value: body.value },
        ip: req.ip,
      });
      return doc;
    }
  );
}
