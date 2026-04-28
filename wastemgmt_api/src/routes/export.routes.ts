import type { FastifyInstance } from 'fastify';
import { DustbinModel } from '../models/Dustbin.js';
import { AlertModel } from '../models/Alert.js';
import { CitizenReportModel } from '../models/CitizenReport.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

/** Minimal RFC 4180 CSV escaping. */
function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\r\n');
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/export/dustbins.csv',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (_req, reply) => {
      const docs = await DustbinModel.find({ isActive: true })
        .select('dustbinId dustbinName zone latitude longitude online lastSeenAt latest')
        .lean();
      const rows = docs.map((d) => ({
        dustbinId: d.dustbinId,
        dustbinName: d.dustbinName,
        zone: d.zone ?? '',
        latitude: d.latitude,
        longitude: d.longitude,
        online: d.online ? 'yes' : 'no',
        lastSeenAt: d.lastSeenAt ? new Date(d.lastSeenAt).toISOString() : '',
        depth: d.latest?.depth ?? '',
        gas: d.latest?.gas ?? '',
        humidity: d.latest?.humidity ?? '',
        temperature: d.latest?.temperature ?? '',
      }));
      reply
        .type('text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="dustbins.csv"');
      return toCsv(rows, [
        'dustbinId',
        'dustbinName',
        'zone',
        'latitude',
        'longitude',
        'online',
        'lastSeenAt',
        'depth',
        'gas',
        'humidity',
        'temperature',
      ]);
    }
  );

  app.get(
    '/export/alerts.csv',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (req, reply) => {
      const q = req.query as { from?: string; to?: string; limit?: string };
      const filter: Record<string, unknown> = {};
      if (q.from || q.to) {
        const range: Record<string, Date> = {};
        if (q.from) range.$gte = new Date(q.from);
        if (q.to) range.$lte = new Date(q.to);
        filter.createdAt = range;
      }
      const docs = await AlertModel.find(filter)
        .sort({ createdAt: -1 })
        .limit(Math.max(1, Math.min(50_000, Number(q.limit) || 5000)))
        .lean();
      const rows = docs.map((a) => ({
        createdAt: a.createdAt,
        dustbinId: a.dustbinId,
        type: a.type,
        severity: a.severity,
        message: a.message,
        metric: a.metric ?? '',
        value: a.value ?? '',
        threshold: a.threshold ?? '',
        acknowledged: a.acknowledged ? 'yes' : 'no',
        acknowledgedBy: a.acknowledgedBy ?? '',
      }));
      reply
        .type('text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="alerts.csv"');
      return toCsv(rows, [
        'createdAt',
        'dustbinId',
        'type',
        'severity',
        'message',
        'metric',
        'value',
        'threshold',
        'acknowledged',
        'acknowledgedBy',
      ]);
    }
  );

  app.get(
    '/export/citizen-reports.csv',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (_req, reply) => {
      const docs = await CitizenReportModel.find({}).sort({ createdAt: -1 }).limit(20_000).lean();
      const rows = docs.map((r) => ({
        createdAt: r.createdAt,
        category: r.category,
        status: r.status,
        dustbinId: r.dustbinId ?? '',
        description: r.description,
        latitude: r.latitude ?? '',
        longitude: r.longitude ?? '',
        contactName: r.contactName ?? '',
        contactEmail: r.contactEmail ?? '',
        contactPhone: r.contactPhone ?? '',
        handledBy: r.handledBy ?? '',
        handledAt: r.handledAt ? new Date(r.handledAt).toISOString() : '',
      }));
      reply
        .type('text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="citizen-reports.csv"');
      return toCsv(rows, [
        'createdAt',
        'category',
        'status',
        'dustbinId',
        'description',
        'latitude',
        'longitude',
        'contactName',
        'contactEmail',
        'contactPhone',
        'handledBy',
        'handledAt',
      ]);
    }
  );
}
