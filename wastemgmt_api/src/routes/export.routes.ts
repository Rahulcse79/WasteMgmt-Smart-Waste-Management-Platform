import type { FastifyInstance, FastifyReply } from 'fastify';
import { DustbinModel } from '../models/Dustbin.js';
import { AlertModel } from '../models/Alert.js';
import { CitizenReportModel } from '../models/CitizenReport.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logger } from '../logger.js';

/** Minimal RFC 4180 CSV escaping. */
function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(headers: string[], row: Record<string, unknown>): string {
  return headers.map((h) => csvEscape(row[h])).join(',') + '\r\n';
}

function startCsv(reply: FastifyReply, filename: string, headers: string[]): void {
  // Hijack so we can stream gigabytes without materialising the whole CSV in
  // memory (was a real OOM risk before). After hijack, Fastify will not touch
  // the response, so we write the status line + headers ourselves on the raw
  // socket — using reply.type()/reply.header() at this point would be ignored.
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store',
    'transfer-encoding': 'chunked',
  });
  reply.raw.write(headers.join(',') + '\r\n');
}

/** Drain a Mongoose cursor into the raw response, line by line, with back-pressure. */
async function streamCursor<T>(
  reply: FastifyReply,
  cursor: AsyncIterable<T>,
  headers: string[],
  rowMapper: (doc: T) => Record<string, unknown>
): Promise<void> {
  try {
    for await (const doc of cursor) {
      const ok = reply.raw.write(csvLine(headers, rowMapper(doc)));
      if (!ok) {
        // Respect TCP back-pressure so a slow client can't blow up RSS.
        await new Promise<void>((resolve) => reply.raw.once('drain', resolve));
      }
    }
    reply.raw.end();
  } catch (err) {
    logger.error({ err }, 'CSV export stream failed mid-flight');
    // Headers are already sent; best we can do is terminate the connection.
    try {
      reply.raw.destroy(err as Error);
    } catch {
      /* ignore */
    }
  }
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/export/dustbins.csv',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (_req, reply) => {
      const headers = [
        'dustbinId', 'dustbinName', 'zone', 'latitude', 'longitude',
        'online', 'lastSeenAt', 'depth', 'gas', 'humidity', 'temperature',
      ];
      startCsv(reply, 'dustbins.csv', headers);
      const cursor = DustbinModel.find({ isActive: true })
        .select('dustbinId dustbinName zone latitude longitude online lastSeenAt latest')
        .lean()
        .cursor();
      await streamCursor(reply, cursor, headers, (d) => ({
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
        if (q.from) {
          const d = new Date(q.from);
          if (!Number.isNaN(d.getTime())) range.$gte = d;
        }
        if (q.to) {
          const d = new Date(q.to);
          if (!Number.isNaN(d.getTime())) range.$lte = d;
        }
        if (Object.keys(range).length) filter.createdAt = range;
      }
      const limit = Math.max(1, Math.min(50_000, Number(q.limit) || 5000));
      const headers = [
        'createdAt', 'dustbinId', 'type', 'severity', 'message',
        'metric', 'value', 'threshold', 'acknowledged', 'acknowledgedBy',
      ];
      startCsv(reply, 'alerts.csv', headers);
      const cursor = AlertModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean().cursor();
      await streamCursor(reply, cursor, headers, (a) => ({
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
    }
  );

  app.get(
    '/export/citizen-reports.csv',
    { preHandler: [requireAuth, requireRole('admin')] },
    async (_req, reply) => {
      const headers = [
        'createdAt', 'category', 'status', 'dustbinId', 'description',
        'latitude', 'longitude', 'contactName', 'contactEmail', 'contactPhone',
        'handledBy', 'handledAt',
      ];
      startCsv(reply, 'citizen-reports.csv', headers);
      const cursor = CitizenReportModel.find({}).sort({ createdAt: -1 }).limit(20_000).lean().cursor();
      await streamCursor(reply, cursor, headers, (r) => ({
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
    }
  );
}
