"use client";

/**
 * Reusable pagination control. Used by every paginated list page in the UI.
 *
 * Why offset (page-numbered) instead of cursor here:
 *   - Lists are bounded (admin grids, alerts, audit). The user benefit of
 *     "jump to page N" outweighs the O(skip) cost on indexed scans of <10⁵ rows.
 *   - Time-series data uses cursor pagination instead — see LiveSensorTable.
 *
 * Accessibility: arrow-key nav, aria-current on active page, descriptive
 * labels for the prev/next buttons. Keep the markup tiny so dashboards
 * with 5+ tables don't bloat the DOM.
 */

import * as React from "react";
import { Button } from "./Primitives";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;          // -1 ⇒ unknown total ("skipTotal" mode)
  onPageChange: (next: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** Hide the page-size selector on dense pages. */
  hidePageSize?: boolean;
  /** Disable everything while a fetch is in-flight. */
  loading?: boolean;
  className?: string;
}

const DEFAULT_SIZES = [10, 25, 50, 100];

/** Build a compact list of page numbers like [1, '…', 4, 5, 6, '…', 23]. */
function buildRange(current: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < totalPages - 1) out.push("…");
  out.push(totalPages);
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_SIZES,
  hidePageSize = false,
  loading = false,
  className = "",
}: PaginationProps): React.JSX.Element {
  const knownTotal = total >= 0;
  const totalPages = knownTotal ? Math.max(1, Math.ceil(total / pageSize)) : Math.max(page, page + 1);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = knownTotal ? Math.min(total, page * pageSize) : page * pageSize;
  const canPrev = page > 1 && !loading;
  const canNext = (!knownTotal || page < totalPages) && !loading;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-sm ${className}`}
      role="navigation"
      aria-label="Pagination"
    >
      <div className="text-white/60" aria-live="polite">
        {knownTotal ? (
          <>
            Showing <span className="font-medium text-white/85">{start.toLocaleString()}</span>–
            <span className="font-medium text-white/85">{end.toLocaleString()}</span> of{" "}
            <span className="font-medium text-white/85">{total.toLocaleString()}</span>
          </>
        ) : (
          <>
            Page <span className="font-medium text-white/85">{page}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!hidePageSize && onPageSizeChange ? (
          <label className="flex items-center gap-2 text-white/60">
            <span className="hidden sm:inline">Rows per page</span>
            <select
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-white"
              value={pageSize}
              disabled={loading}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((s) => (
                <option key={s} value={s} className="bg-slate-900">
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          ‹ Prev
        </Button>

        <ul className="hidden items-center gap-1 sm:flex" role="list">
          {buildRange(page, totalPages).map((p, i) =>
            p === "…" ? (
              <li key={`g-${i}`} className="px-2 text-white/40" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={p}>
                <button
                  type="button"
                  disabled={loading || p === page}
                  aria-current={p === page ? "page" : undefined}
                  onClick={() => onPageChange(p)}
                  className={
                    p === page
                      ? "min-w-[2rem] rounded-md bg-blue-500/30 px-2 py-1 text-center font-medium text-white ring-1 ring-blue-400/40"
                      : "min-w-[2rem] rounded-md px-2 py-1 text-center text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
                  }
                >
                  {p}
                </button>
              </li>
            )
          )}
        </ul>

        <Button
          variant="ghost"
          size="sm"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next ›
        </Button>
      </div>
    </div>
  );
}
