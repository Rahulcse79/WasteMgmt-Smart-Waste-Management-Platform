import { DustbinModel } from '../models/Dustbin.js';
import { AlertService } from './alert.service.js';
import { wsHub } from './ws.service.js';
import { logger } from '../logger.js';

const OFFLINE_AFTER_MS = 5 * 60 * 1000; // 5 min without a reading -> offline
let timer: NodeJS.Timeout | null = null;

export const HeartbeatService = {
  start(intervalMs = 60_000): void {
    if (timer) return;
    timer = setInterval(() => {
      void HeartbeatService.tick().catch((err) => logger.error({ err }, 'heartbeat tick failed'));
    }, intervalMs);
    logger.info({ intervalMs }, '❤️  Heartbeat monitor started');
  },

  async tick(): Promise<void> {
    const cutoff = new Date(Date.now() - OFFLINE_AFTER_MS);
    const stale = await DustbinModel.find({ online: true, lastSeenAt: { $lt: cutoff } })
      .select('dustbinId tenantId')
      .lean();
    if (stale.length === 0) return;

    await DustbinModel.updateMany(
      { _id: { $in: stale.map((s) => s._id) } },
      { $set: { online: false } }
    );

    for (const s of stale) {
      await AlertService.raise({
        dustbinId: s.dustbinId,
        type: 'OFFLINE',
        severity: 'warning',
        message: `Device ${s.dustbinId} stopped reporting (no data for >5m)`,
        tenantId: s.tenantId,
      });
      wsHub.broadcast(`dustbin:${s.dustbinId}`, 'offline', { dustbinId: s.dustbinId });
    }
  },

  stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  },
};
