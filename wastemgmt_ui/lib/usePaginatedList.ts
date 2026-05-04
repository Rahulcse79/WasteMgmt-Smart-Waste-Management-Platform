"use client";

/**
 * `usePaginatedList` — single hook every list page uses.
 *
 * Responsibilities:
 *   - Owns `page`, `pageSize`, and arbitrary filter values (passed through opaquely).
 *   - Aborts in-flight requests when filters/page change (no race-driven flicker).
 *   - Debounces filter changes by 250ms so typing into a search field doesn't
 *     fire a request per keystroke.
 *   - Keeps the previous page's items visible while the next page loads
 *     (`previousData`-style UX) — the table doesn't blank out on page-flip.
 *   - Exposes a stable `refresh()` so mutations (delete, ack) can re-fetch
 *     the *current* page without resetting filters.
 *
 * Performance notes:
 *   - We never hold more than `pageSize` rows in memory.
 *   - Filter changes auto-reset to page 1 (otherwise you'd be looking at
 *     "page 7 of 2" and getting an empty list).
 *   - The fetcher receives an AbortSignal — implementers can wire it to
 *     axios's `signal` option (already done for the typed wrappers).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Page, PageOpts } from "./api";
import { DEFAULT_PAGE_SIZE } from "./api";

export interface UsePaginatedListOpts<F extends Record<string, unknown>> {
  fetcher: (args: PageOpts & F, signal?: AbortSignal) => Promise<Page<unknown>>;
  initialFilters?: F;
  initialPageSize?: number;
  /** Bypass the COUNT(*) for hot lists (notifications dropdown etc.). */
  skipTotal?: boolean;
  /** ms — defaults to 250. Set 0 for instant. */
  debounceMs?: number;
}

export interface UsePaginatedListResult<T, F> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  /** True only on the *first* fetch; lets the UI show a skeleton then never again. */
  initialLoading: boolean;
  error: string | null;
  filters: F;
  setFilters: (next: F | ((prev: F) => F)) => void;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  /** Re-fetches the current page WITHOUT resetting filters — for after mutations. */
  refresh: () => void;
}

export function usePaginatedList<T, F extends Record<string, unknown>>(
  opts: UsePaginatedListOpts<F>
): UsePaginatedListResult<T, F> {
  const {
    fetcher,
    initialFilters = {} as F,
    initialPageSize = DEFAULT_PAGE_SIZE,
    skipTotal = false,
    debounceMs = 250,
  } = opts;

  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(initialPageSize);
  const [filters, setFiltersRaw] = useState<F>(initialFilters);
  const [data, setData] = useState<Page<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Keep the latest fetcher in a ref so the effect deps don't churn when
  // the consumer passes a freshly-constructed arrow function each render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Resetting filters always returns to page 1 — mounted-flag guards the
  // very first render from triggering a redundant reset.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPageRaw(1);
  }, [filters, pageSize]);

  useEffect(() => {
    const ctrl = new AbortController();
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetcherRef
        .current({ page, pageSize, skipTotal, ...filters }, ctrl.signal)
        .then((res) => {
          setData(res as Page<T>);
        })
        .catch((err: unknown) => {
          // Axios cancel on filter change — silently swallow.
          if ((err as { name?: string })?.name === "CanceledError") return;
          if ((err as { code?: string })?.code === "ERR_CANCELED") return;
          const msg =
            (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            (err as { message?: string })?.message ??
            "Failed to load";
          setError(msg);
        })
        .finally(() => {
          setLoading(false);
          setInitialLoading(false);
        });
    }, debounceMs);

    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [page, pageSize, filters, skipTotal, debounceMs, refreshTick]);

  const setFilters = useCallback((next: F | ((prev: F) => F)) => {
    setFiltersRaw((prev) => (typeof next === "function" ? (next as (p: F) => F)(prev) : next));
  }, []);

  const setPage = useCallback((n: number) => setPageRaw(Math.max(1, Math.floor(n))), []);
  const setPageSize = useCallback((n: number) => setPageSizeRaw(Math.max(1, Math.floor(n))), []);
  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  return useMemo(
    () => ({
      items: (data?.items as T[]) ?? [],
      total: data?.total ?? 0,
      page,
      pageSize,
      totalPages: data?.totalPages ?? 1,
      loading,
      initialLoading,
      error,
      filters,
      setFilters,
      setPage,
      setPageSize,
      refresh,
    }),
    [data, page, pageSize, loading, initialLoading, error, filters, setFilters, setPage, setPageSize, refresh]
  );
}
