"use client";
/**
 * LiveSensorTable
 *
 * Top-recent telemetry feed with date / metric / bin filters and cursor-based
 * paging. Designed for scale: it never SELECT *'s the full collection — every
 * fetch is bounded by `pageSize` and uses the keyset cursor returned by the API.
 *
 * Default mode = "recent": polls /sensor-readings/recent every `pollMs` and
 * shows the latest N rows in real time.
 *
 * When the user opens filters, mode flips to "filtered": single-shot
 * cursor-paginated query against /sensor-readings.
 *
 * Live WebSocket pushes also splice into the recent view so the table updates
 * without waiting for the next poll.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sensorReadings, type SensorReadingItem } from "@/lib/api";
import { useLiveSocket } from "@/lib/socket";
import { Card, CardBody, CardHeader, CardTitle, Chip, EmptyState, Skeleton } from "@/components/ui/Primitives";

type Metric = SensorReadingItem["metric"];

interface Props {
  pageSize?: number;
  pollMs?: number;
  showFilters?: boolean;
  title?: string;
}

const METRICS: Metric[] = ["depth", "gas", "humidity", "temperature"];

const METRIC_UNIT: Record<Metric, string> = {
  depth: "%",
  gas: " ppm",
  humidity: "%",
  temperature: "°C",
};

function metricTone(m: Metric, v: number): "default" | "success" | "warning" | "danger" | "info" {
  if (m === "depth") return v >= 80 ? "danger" : v >= 50 ? "warning" : "success";
  if (m === "gas") return v >= 400 ? "danger" : v >= 200 ? "warning" : "success";
  if (m === "temperature") return v >= 60 ? "danger" : v >= 45 ? "warning" : "info";
  return "info";
}

export function LiveSensorTable({
  pageSize = 10,
  pollMs = 5000,
  showFilters = true,
  title = "Live sensor feed",
}: Props): React.ReactElement {
  const [items, setItems] = useState<SensorReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [bin, setBin] = useState<string>("");
  const [metric, setMetric] = useState<"" | Metric>("");
  const [from, setFrom] = useState<string>(""); // <input type="datetime-local"> value
  const [to, setTo] = useState<string>("");

  // Pagination state (only meaningful in "filtered" mode)
  const [cursors, setCursors] = useState<Array<string | null>>([null]); // stack of cursors per page
  const [pageIdx, setPageIdx] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const isFiltered = useMemo(
    () => Boolean(bin || metric || from || to),
    [bin, metric, from, to]
  );

  // Convert local datetime-local "2026-04-29T13:30" → ISO with current TZ.
  const toIso = (v: string): string | undefined => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  };

  const loadRecent = useCallback(async () => {
    try {
      setError(null);
      const rows = await sensorReadings.recent({ limit: pageSize });
      setItems(rows);
    } catch (e) {
      const x = e as { response?: { data?: { error?: string } }; message?: string };
      setError(x?.response?.data?.error ?? x?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  const loadFiltered = useCallback(
    async (cursor: string | null) => {
      try {
        setLoading(true);
        setError(null);
        const data = await sensorReadings.list({
          dustbinId: bin || undefined,
          metric: (metric || undefined) as Metric | undefined,
          from: toIso(from),
          to: toIso(to),
          limit: pageSize,
          cursor: cursor ?? undefined,
        });
        setItems(data.items);
        setNextCursor(data.nextCursor);
      } catch (e) {
        const x = e as { response?: { data?: { error?: string } }; message?: string };
        setError(x?.response?.data?.error ?? x?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [bin, metric, from, to, pageSize]
  );

  // Initial + filter-change loads
  const lastFilterKey = useRef("");
  useEffect(() => {
    const key = `${isFiltered}|${bin}|${metric}|${from}|${to}|${pageSize}`;
    if (lastFilterKey.current === key) return;
    lastFilterKey.current = key;
    setCursors([null]);
    setPageIdx(0);
    setNextCursor(null);
    if (isFiltered) {
      void loadFiltered(null);
    } else {
      void loadRecent();
    }
  }, [isFiltered, bin, metric, from, to, pageSize, loadFiltered, loadRecent]);

  // Poll the "recent" feed at pollMs while no filters are applied.
  useEffect(() => {
    if (isFiltered) return;
    const id = window.setInterval(() => void loadRecent(), pollMs);
    return () => window.clearInterval(id);
  }, [isFiltered, pollMs, loadRecent]);

  // Live splicing — only meaningful in "recent" mode.
  useLiveSocket(["dustbin:*"], (e) => {
    if (isFiltered) return;
    if (e.event !== "reading") return;
    const p = e.payload as {
      dustbinId: string;
      timestamp: string;
      metrics: Partial<Record<Metric, number>>;
    };
    const ts = p.timestamp || new Date().toISOString();
    const fresh: SensorReadingItem[] = [];
    for (const m of METRICS) {
      const v = p.metrics[m];
      if (typeof v === "number") {
        fresh.push({
          id: `live-${p.dustbinId}-${m}-${ts}`,
          dustbinId: p.dustbinId,
          metric: m,
          value: v,
          timestamp: ts,
        });
      }
    }
    if (fresh.length === 0) return;
    setItems((prev) => [...fresh, ...prev].slice(0, pageSize));
  });

  function nextPage(): void {
    if (!nextCursor) return;
    const newCursors = [...cursors.slice(0, pageIdx + 1), nextCursor];
    setCursors(newCursors);
    setPageIdx(pageIdx + 1);
    void loadFiltered(nextCursor);
  }
  function prevPage(): void {
    if (pageIdx === 0) return;
    const newIdx = pageIdx - 1;
    setPageIdx(newIdx);
    void loadFiltered(cursors[newIdx] ?? null);
  }
  function clearFilters(): void {
    setBin("");
    setMetric("");
    setFrom("");
    setTo("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title}{" "}
          {!isFiltered ? (
            <span className="chip info ml-2">
              <span className="live-dot" /> live · top {pageSize}
            </span>
          ) : (
            <span className="chip ml-2">filtered</span>
          )}
        </CardTitle>
        {showFilters ? (
          <button onClick={clearFilters} className="btn btn-ghost btn-sm" disabled={!isFiltered}>
            Clear filters
          </button>
        ) : null}
      </CardHeader>

      {showFilters ? (
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <input
              className="input"
              placeholder="Dustbin id (e.g. BIN-001)"
              value={bin}
              onChange={(e) => setBin(e.target.value.trim())}
            />
            <select className="select" value={metric} onChange={(e) => setMetric(e.target.value as "" | Metric)}>
              <option value="">All metrics</option>
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              className="input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From"
            />
            <input
              type="datetime-local"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To"
            />
          </div>
        </CardBody>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Bin</th>
              <th className="px-4 py-3 text-left">Metric</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
            {loading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState title="Couldn't load readings" hint={error} />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title={isFiltered ? "No readings for these filters" : "Waiting for the first reading…"}
                    hint={isFiltered ? "Try widening the date range or clearing filters." : "New telemetry appears here as devices report in."}
                  />
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-2 whitespace-nowrap" style={{ color: "var(--fg-muted)" }}>
                    {new Date(r.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.dustbinId}</td>
                  <td className="px-4 py-2 capitalize">{r.metric}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {r.value.toFixed(r.metric === "temperature" || r.metric === "humidity" ? 1 : 0)}
                    <span style={{ color: "var(--fg-muted)" }}>{METRIC_UNIT[r.metric]}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Chip tone={metricTone(r.metric, r.value)}>{metricTone(r.metric, r.value)}</Chip>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isFiltered ? (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
            Page {pageIdx + 1} · showing up to {pageSize} rows
          </span>
          <div className="flex items-center gap-2">
            <button onClick={prevPage} disabled={pageIdx === 0 || loading} className="btn btn-sm">
              ← Prev
            </button>
            <button onClick={nextPage} disabled={!nextCursor || loading} className="btn btn-sm btn-primary">
              Next →
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
