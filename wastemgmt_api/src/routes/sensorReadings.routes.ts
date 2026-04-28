/**
 * Sensor reading queries — exposes the time-series collection to the UI in a
 * scalable, paginated way.
 *
 * Endpoints:
 *   GET /sensor-readings           — keyset/cursor pagination, "newest first"
 *   GET /sensor-readings/recent    — top-N latest rows (cheap, no cursor)
 *   GET /sensor-readings/by-bin/:dustbinId
 *
 * Pagination uses keyset (cursor = ISO timestamp + _id) instead of `skip`
 * so the cost stays O(log N) regardless of dataset size.
 *
 * Auth: any signed-in user. Non-admin users only see readings for the bins
 *       they're assigned to (see `req.user.role / assignedDustbins`).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Types } from 'mongoose';
import { SensorReadingModel } from '../models/SensorReading.js';
import { UserModel } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';

const METRICS = ['depth', 'gas', 'humidity', 'temperature'] as const;

/** Hard ceiling so a single page can never DoS the server. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 10;

const ListQuerySchema = z.object({
  dustbinId: z.string().optional(),
  metric: z.enum(METRICS).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
  // Cursor format: "<ISO-timestamp>_<objectId>".  Returned by previous page.
  cursor: z.string().optional(),
  // Optional comma-separated list of dustbin ids for cross-bin queries.
  dustbinIds: z.string().optional(),
});

const RecentQuerySchema = z.object({
  dustbinId: z.string().optional(),
  metric: z.enum(METRICS).optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

const BinQuerySchema = z.object({
  metric: z.enum(METRICS).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.string().optional(),
});

interface CursorParts {
  ts: Date;
  id: Types.ObjectId;
}

function parseCursor(raw?: string): CursorParts | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf('_');
  if (idx <= 0) return null;
  const tsPart = raw.slice(0, idx);
  const idPart = raw.slice(idx + 1);
  const ts = new Date(tsPart);
  if (Number.isNaN(ts.getTime()) || !Types.ObjectId.isValid(idPart)) return null;
  return { ts, id: new Types.ObjectId(idPart) };
}

function encodeCursor(ts: Date, id: Types.ObjectId | string): string {
  return `${ts.toISOString()}_${id.toString()}`;
}

/** Resolve which dustbin ids the requesting user is allowed to read. */
async function resolveScope(
  user: { sub: string; role: 'admin' | 'user' },
  requested: string[] | undefined
): Promise<string[] | null> {
  if (user.role === 'admin') {
    return requested && requested.length > 0 ? requested : null; // null = no restriction
  }
  const u = await UserModel.findById(user.sub).select('assignedDustbins').lean();
  const allowed = new Set(u?.assignedDustbins ?? []);
  if (!requested || requested.length === 0) return Array.from(allowed);
  return requested.filter((id) => allowed.has(id));
}

export async function sensorReadingsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /sensor-readings
   * Keyset-paginated list, newest first. Supports filters: dustbinId, metric,
   * from, to. Returns `{ items, nextCursor }`. `nextCursor === null` ⇒ end.
   */
  app.get(
    '/sensor-readings',
    { preHandler: [requireAuth, validateQuery(ListQuerySchema)] },
    async (req) => {
      const q = req.query as z.infer<typeof ListQuerySchema>;
      const ids =
        q.dustbinIds
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean) ?? (q.dustbinId ? [q.dustbinId] : undefined);
      const scope = await resolveScope(req.user!, ids);

      const filter: Record<string, unknown> = {};
      if (scope !== null) filter.dustbinId = { $in: scope };
      if (q.metric) filter.metric = q.metric;
      if (q.from || q.to) {
        const range: Record<string, Date> = {};
        if (q.from) range.$gte = new Date(q.from);
        if (q.to) range.$lte = new Date(q.to);
        filter.timestamp = range;
      }

      const cur = parseCursor(q.cursor);
      if (cur) {
        // Newest-first cursor: next page starts strictly *before* the cursor.
        filter.$or = [
          { timestamp: { $lt: cur.ts } },
          { timestamp: cur.ts, _id: { $lt: cur.id } },
        ];
      }

      const items = await SensorReadingModel.find(filter)
        .sort({ timestamp: -1, _id: -1 })
        .limit(q.limit + 1) // fetch one extra to detect "has next"
        .lean();

      const hasMore = items.length > q.limit;
      const page = hasMore ? items.slice(0, q.limit) : items;
      const last = page[page.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor(last.timestamp as Date, (last as { _id: Types.ObjectId })._id)
          : null;

      return {
        items: page.map((r) => ({
          id: String((r as { _id: Types.ObjectId })._id),
          dustbinId: r.dustbinId,
          metric: r.metric,
          value: r.value,
          timestamp: r.timestamp,
        })),
        nextCursor,
        pageSize: q.limit,
      };
    }
  );

  /**
   * GET /sensor-readings/recent — fast top-N for live dashboards.
   * No cursor, no count. Use this for the "latest 10" widget on the home page.
   */
  app.get(
    '/sensor-readings/recent',
    { preHandler: [requireAuth, validateQuery(RecentQuerySchema)] },
    async (req) => {
      const q = req.query as z.infer<typeof RecentQuerySchema>;
      const scope = await resolveScope(req.user!, q.dustbinId ? [q.dustbinId] : undefined);
      const filter: Record<string, unknown> = {};
      if (scope !== null) filter.dustbinId = { $in: scope };
      if (q.metric) filter.metric = q.metric;
      const items = await SensorReadingModel.find(filter)
        .sort({ timestamp: -1, _id: -1 })
        .limit(q.limit)
        .lean();
      return {
        items: items.map((r) => ({
          id: String((r as { _id: Types.ObjectId })._id),
          dustbinId: r.dustbinId,
          metric: r.metric,
          value: r.value,
          timestamp: r.timestamp,
        })),
      };
    }
  );

  /** GET /sensor-readings/by-bin/:dustbinId — same shape as /sensor-readings. */
  app.get(
    '/sensor-readings/by-bin/:dustbinId',
    { preHandler: [requireAuth, validateQuery(BinQuerySchema)] },
    async (req, reply) => {
      const { dustbinId } = req.params as { dustbinId: string };
      const q = req.query as z.infer<typeof BinQuerySchema>;
      const scope = await resolveScope(req.user!, [dustbinId]);
      if (scope !== null && scope.length === 0) {
        return reply.code(403).send({ error: 'Forbidden — bin not in your assigned scope' });
      }
      const filter: Record<string, unknown> = { dustbinId };
      if (q.metric) filter.metric = q.metric;
      if (q.from || q.to) {
        const range: Record<string, Date> = {};
        if (q.from) range.$gte = new Date(q.from);
        if (q.to) range.$lte = new Date(q.to);
        filter.timestamp = range;
      }
      const cur = parseCursor(q.cursor);
      if (cur) {
        filter.$or = [
          { timestamp: { $lt: cur.ts } },
          { timestamp: cur.ts, _id: { $lt: cur.id } },
        ];
      }
      const items = await SensorReadingModel.find(filter)
        .sort({ timestamp: -1, _id: -1 })
        .limit(q.limit + 1)
        .lean();
      const hasMore = items.length > q.limit;
      const page = hasMore ? items.slice(0, q.limit) : items;
      const last = page[page.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor(last.timestamp as Date, (last as { _id: Types.ObjectId })._id)
          : null;
      return {
        items: page.map((r) => ({
          id: String((r as { _id: Types.ObjectId })._id),
          dustbinId: r.dustbinId,
          metric: r.metric,
          value: r.value,
          timestamp: r.timestamp,
        })),
        nextCursor,
        pageSize: q.limit,
      };
    }
  );
}
