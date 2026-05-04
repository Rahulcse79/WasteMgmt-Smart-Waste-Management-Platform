/**
 * Shared pagination helpers for list endpoints.
 *
 * Design choices (single-tenant single-region scale, lists ≤ ~10⁵ rows):
 *  - Offset pagination is *fine here* because every list query is filtered
 *    + indexed and the dataset is bounded. For the unbounded time-series
 *    collection we use cursor pagination — see sensorReadings.routes.ts.
 *  - The wire format is an envelope `{ items, total, page, pageSize,
 *    totalPages }` *only when* the caller passes `?page=`. If `page` is
 *    absent we keep returning the legacy array, which preserves every
 *    existing integration test and any external script that still expects
 *    the old shape.
 *  - `total` uses `countDocuments(filter)` which is O(filter scan) but
 *    indexes make it cheap; we expose `?skipTotal=1` for hot paths that
 *    don't need a pager (returns total = -1).
 */
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

/** Hard upper bound — defends against `?pageSize=999999`. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 10;

export const PageQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
  skipTotal: z.union([z.literal('1'), z.literal('true')]).optional(),
});

export interface PageEnvelope<T> {
  items: T[];
  total: number; // -1 when skipTotal
  page: number;
  pageSize: number;
  totalPages: number; // -1 when skipTotal
}

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  /** True when the request did NOT include `?page=` — caller should return the legacy array. */
  legacy: boolean;
  skipTotal: boolean;
}

/**
 * Parse `page`, `pageSize`, `skipTotal` from a request query bag. Always
 * returns sensible defaults so the caller can use the values unconditionally.
 */
export function parsePage(req: FastifyRequest): PageParams {
  const raw = (req.query ?? {}) as Record<string, unknown>;
  const parsed = PageQuerySchema.safeParse(raw);
  // Invalid `pageSize` etc. is deliberately silent — clamp + fall back rather
  // than 400, because list endpoints must remain forgiving.
  const data = parsed.success ? parsed.data : {};
  const legacy = data.page === undefined;
  const page = Math.max(1, data.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, data.pageSize ?? DEFAULT_PAGE_SIZE));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    legacy,
    skipTotal: data.skipTotal === '1' || data.skipTotal === 'true',
  };
}

export function buildEnvelope<T>(items: T[], total: number, p: PageParams): PageEnvelope<T> {
  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: total < 0 ? -1 : Math.max(1, Math.ceil(total / p.pageSize)),
  };
}
