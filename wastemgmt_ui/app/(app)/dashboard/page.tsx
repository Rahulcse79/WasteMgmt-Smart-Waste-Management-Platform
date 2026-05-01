"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { analytics, api, type DashboardKpis } from "@/lib/api";
import { useLiveSocket } from "@/lib/socket";
import { latestOf, type Dustbin } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { EyeIcon, BellIcon, TrashIcon } from "@/components/Icons";
import { ChartIcon, TruckIcon, CheckIcon } from "@/components/IconsExtended";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Chip,
  EmptyState,
  FillBar,
  KpiTile,
  Skeleton,
  Sparkline,
} from "@/components/ui/Primitives";
import { LiveSensorTable } from "@/components/LiveSensorTable";

const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[480px] rounded-2xl glass animate-pulse" />,
});

function fillTone(d?: number) {
  if (d == null) return "default" as const;
  if (d >= 80) return "danger" as const;
  if (d >= 50) return "warning" as const;
  return "success" as const;
}

export default function DashboardPage(): React.ReactElement {
  const { t } = useT();
  const [items, setItems] = useState<Dustbin[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "healthy" | "offline">("all");
  const [q, setQ] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [bins, k] = await Promise.all([
        api.get<Dustbin[]>("/dustbins").then((r) => r.data),
        analytics.dashboard().catch(() => null),
      ]);
      setItems(bins);
      setKpis(k);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Live updates — splice incoming readings into the matching bin's history.
  useLiveSocket(["dustbin:*"], (e) => {
    if (e.event !== "reading") return;
    const p = e.payload as {
      dustbinId: string;
      timestamp: string;
      metrics: Partial<Record<"depth" | "gas" | "humidity" | "temperature", number>>;
    };
    setItems((prev) =>
      prev.map((d) => {
        if (d.dustbinId !== p.dustbinId) return d;
        const ts = p.timestamp;
        const next: Dustbin = { ...d, latest: { ...(d.latest ?? {}), timestamp: ts, ...p.metrics } };
        for (const k of ["depth", "gas", "humidity", "temperature"] as const) {
          const v = p.metrics[k];
          if (typeof v === "number") {
            next[k] = [...(d[k] ?? []), { value: v, timestamp: ts }].slice(-200);
          }
        }
        return next;
      })
    );
  });

  const filtered = useMemo(() => {
    return items.filter((d) => {
      const depth = latestOf(d.depth, d.latest?.depth);
      if (filter === "critical" && !(depth != null && depth >= 80)) return false;
      if (filter === "warning"  && !(depth != null && depth >= 50 && depth < 80)) return false;
      if (filter === "healthy"  && !(depth != null && depth < 50)) return false;
      if (filter === "offline"  && d.online !== false) return false;
      if (q) {
        const needle = q.toLowerCase();
        const hay = `${d.dustbinId} ${d.dustbinName} ${d.zone ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, filter, q]);

  const counts = useMemo(() => {
    let critical = 0, warning = 0, healthy = 0, offline = 0;
    for (const d of items) {
      const v = latestOf(d.depth, d.latest?.depth);
      if (d.online === false) offline++;
      if (v == null) continue;
      if (v >= 80) critical++;
      else if (v >= 50) warning++;
      else healthy++;
    }
    return { critical, warning, healthy, offline };
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Hero header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-grad">Operations</span> dashboard
          </h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Live telemetry for {items.length} bin{items.length === 1 ? "" : "s"} across your network.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/analytics" className="btn"><ChartIcon /> {t("nav.analytics")}</Link>
          <Link href="/driver" className="btn btn-primary"><TruckIcon /> {t("nav.driver")}</Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile label={t("kpi.totalBins")} value={loading ? "—" : items.length} icon={<TrashIcon />} loading={loading} />
        <KpiTile label={t("kpi.online")} value={loading ? "—" : (kpis ? kpis.online : items.filter((d) => d.online !== false).length)} tone="success" icon={<CheckIcon />} loading={loading} />
        <KpiTile label={t("kpi.critical")} value={counts.critical} tone="danger" icon={<BellIcon />} loading={loading} />
        <KpiTile label={t("kpi.warning")} value={counts.warning} tone="warning" loading={loading} />
        <KpiTile label={t("kpi.avgFill")} value={loading ? "—" : `${(Number(kpis?.avgFill ?? averageFill(items)) || 0).toFixed(0)} %`} tone="info" loading={loading} />
        <KpiTile label={t("kpi.openAlerts")} value={kpis?.openAlerts ?? 0} tone="danger" loading={loading} />
      </div>

      {/* Map */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Live map</CardTitle>
          <span className="chip info"><span className="live-dot" /> realtime</span>
        </CardHeader>
        <div className="p-3">
          <MapView dustbins={items} height={460} />
        </div>
      </Card>

      {/* Live sensor feed — top-N recent readings, server-paginated when filtered */}
      <LiveSensorTable pageSize={10} pollMs={5000} />

      {/* Bins table */}
      <Card>
        <CardHeader>
          <CardTitle>Bins</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by id, name, zone…"
              className="input max-w-[220px]"
            />
            <div className="flex items-center gap-1 flex-wrap">
              {([
                { k: "all", label: "All" },
                { k: "critical", label: t("kpi.critical") },
                { k: "warning", label: t("kpi.warning") },
                { k: "healthy", label: t("kpi.healthy") },
                { k: "offline", label: "Offline" },
              ] as const).map((f) => (
                <button
                  key={f.k}
                  onClick={() => setFilter(f.k)}
                  className={`btn btn-sm ${filter === f.k ? "btn-primary" : "btn-ghost"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                <th className="px-4 py-3 text-left">Bin</th>
                <th className="px-4 py-3 text-left">Zone</th>
                <th className="px-4 py-3 text-left">Fill</th>
                <th className="px-4 py-3 text-left">Trend</th>
                <th className="px-4 py-3 text-center">Temp</th>
                <th className="px-4 py-3 text-center">Hum.</th>
                <th className="px-4 py-3 text-center">Gas</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center" />
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9}><EmptyState title="No bins match your filters" hint="Try clearing the search or filter chips." icon={<TrashIcon />} /></td></tr>
              ) : (
                filtered.map((d) => {
                  const depth = latestOf(d.depth, d.latest?.depth);
                  const temp = latestOf(d.temperature, d.latest?.temperature);
                  const hum = latestOf(d.humidity, d.latest?.humidity);
                  const gas = latestOf(d.gas, d.latest?.gas);
                  const trend = (d.depth ?? []).slice(-24).map((r) => r.value);
                  return (
                    <tr key={d.dustbinId} className="hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <div className="font-medium">{d.dustbinName}</div>
                        <div className="text-[11px] font-mono" style={{ color: "var(--fg-subtle)" }}>{d.dustbinId}</div>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--fg-muted)" }}>{d.zone ?? "—"}</td>
                      <td className="px-4 py-3 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div className="w-24"><FillBar value={depth ?? 0} /></div>
                          <span className="font-semibold tabular-nums">{depth != null ? `${depth.toFixed(0)}%` : "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Sparkline values={trend.length ? trend : [0]} /></td>
                      <td className="px-4 py-3 text-center tabular-nums">{temp != null ? `${temp.toFixed(0)}°` : "—"}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{hum != null ? `${hum.toFixed(0)}%` : "—"}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{gas != null ? `${gas.toFixed(0)}` : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {d.online === false ? (
                          <Chip tone="danger">Offline</Chip>
                        ) : (
                          <Chip tone={fillTone(depth)}>
                            {fillTone(depth) === "danger" ? "Critical" : fillTone(depth) === "warning" ? "Warning" : "OK"}
                          </Chip>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/dashboard/${encodeURIComponent(d.dustbinId)}`}
                          className="btn btn-ghost btn-sm"
                          aria-label={`View ${d.dustbinName}`}
                        >
                          <EyeIcon />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function averageFill(items: Dustbin[]): number {
  let sum = 0; let n = 0;
  for (const d of items) {
    const v = latestOf(d.depth, d.latest?.depth);
    if (v != null) { sum += v; n++; }
  }
  return n === 0 ? 0 : sum / n;
}
