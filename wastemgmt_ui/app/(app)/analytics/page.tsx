"use client";
import { useEffect, useState } from "react";
import { analytics, type DashboardKpis } from "@/lib/api";
import { Card, CardBody, CardHeader, CardTitle, Chip, EmptyState, FillBar, KpiTile, Skeleton } from "@/components/ui/Primitives";
import { ChartIcon } from "@/components/IconsExtended";
import { useT } from "@/lib/i18n";

export default function AnalyticsPage(): React.ReactElement {
  const { t } = useT();
  const [data, setData] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const k = await analytics.dashboard();
        if (alive) setData(k);
      } catch (e) {
        const ex = e as { response?: { data?: { error?: string } } };
        if (alive) setErr(ex?.response?.data?.error ?? "Failed to load analytics");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="text-grad">Analytics</span></h1>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>Network-wide KPIs, fill distribution, and zone health.</p>
      </div>

      {err ? <Card><CardBody><div className="chip danger">{err}</div></CardBody></Card> : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile label={t("kpi.totalBins")} value={data?.totals.dustbins ?? "—"} loading={loading} />
        <KpiTile label={t("kpi.online")} value={data?.totals.online ?? "—"} tone="success" loading={loading} />
        <KpiTile label="Offline" value={data?.totals.offline ?? "—"} tone="danger" loading={loading} />
        <KpiTile label={t("kpi.avgFill")} value={data ? `${(Number(data.totals.avgFill) || 0).toFixed(0)} %` : "—"} tone="info" loading={loading} />
        <KpiTile label={t("kpi.openAlerts")} value={data?.totals.openAlerts ?? 0} tone="warning" loading={loading} />
        <KpiTile label={t("kpi.openReports")} value={data?.totals.citizenReportsOpen ?? 0} tone="info" loading={loading} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Fill distribution</CardTitle><span className="chip">last reading per bin</span></CardHeader>
          <CardBody>
            {loading ? <Skeleton className="h-40 w-full" /> : data ? <FillBuckets data={data} /> : <EmptyState title={t("common.empty")} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top fullest bins</CardTitle><span className="chip warning">priority pickups</span></CardHeader>
          <CardBody className="space-y-3">
            {loading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />) :
              data && data.topFull.length > 0 ? data.topFull.map((b) => (
                <div key={b.dustbinId} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{b.dustbinName}</div>
                    <div className="text-[11px] font-mono" style={{ color: "var(--fg-subtle)" }}>{b.dustbinId} · {b.zone}</div>
                  </div>
                  <div className="w-32"><FillBar value={b.fill} /></div>
                  <div className="w-12 text-right tabular-nums font-semibold">{b.fill.toFixed(0)}%</div>
                </div>
              )) : <EmptyState title="No bins" icon={<ChartIcon />} />
            }
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Zone health</CardTitle></CardHeader>
        <CardBody>
          {loading ? <Skeleton className="h-32 w-full" /> :
            data && data.zones.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                      <th className="px-3 py-2 text-left">Zone</th>
                      <th className="px-3 py-2 text-right">Bins</th>
                      <th className="px-3 py-2 text-right">Critical</th>
                      <th className="px-3 py-2 text-right">Avg fill</th>
                      <th className="px-3 py-2">Health</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {data.zones.map((z) => (
                      <tr key={z.zone}>
                        <td className="px-3 py-2 font-medium">{z.zone}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{z.count}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {z.critical > 0 ? <Chip tone="danger">{z.critical}</Chip> : <Chip tone="success">0</Chip>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{z.avgFill.toFixed(0)} %</td>
                        <td className="px-3 py-2 min-w-[200px]"><FillBar value={z.avgFill} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No zones" />
          }
        </CardBody>
      </Card>
    </div>
  );
}

function FillBuckets({ data }: { data: DashboardKpis }): React.ReactElement {
  const buckets: Array<{ label: string; key: "0-25" | "25-50" | "50-75" | "75-90" | "90-100"; color: string }> = [
    { label: "0-25%", key: "0-25", color: "var(--success)" },
    { label: "25-50%", key: "25-50", color: "var(--success)" },
    { label: "50-75%", key: "50-75", color: "var(--warning)" },
    { label: "75-90%", key: "75-90", color: "var(--warning)" },
    { label: "90-100%", key: "90-100", color: "var(--danger)" },
  ];
  const valueOf = (key: (typeof buckets)[number]["key"]): number =>
    data.fillBuckets.find((b) => b.bucket === key)?.count ?? 0;
  const max = Math.max(1, ...buckets.map((b) => valueOf(b.key)));
  return (
    <div className="space-y-3">
      {buckets.map((b) => {
        const v = valueOf(b.key);
        const pct = (v / max) * 100;
        return (
          <div key={b.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "var(--fg-muted)" }}>{b.label}</span>
              <span className="tabular-nums font-medium">{v}</span>
            </div>
            <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: b.color, boxShadow: `0 0 16px ${b.color}66` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
