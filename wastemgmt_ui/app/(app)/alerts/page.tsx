"use client";
import { useEffect, useMemo, useState } from "react";
import { api, exports as ex } from "@/lib/api";
import { useLiveSocket } from "@/lib/socket";
import type { Alert } from "@/lib/types";
import { Card, CardBody, CardHeader, CardTitle, Chip, EmptyState, Skeleton } from "@/components/ui/Primitives";
import { BellIcon } from "@/components/Icons";
import { CheckIcon, DownloadIcon } from "@/components/IconsExtended";

type Severity = Alert["severity"];

export default function AlertsPage(): React.ReactElement {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Severity | "open">("open");

  const load = () => api.get<Alert[]>("/alerts").then((r) => setAlerts(r.data)).catch(() => undefined).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);
  // Re-poll on any inbound bin event — alerts may have been raised on the server.
  useLiveSocket(["dustbin:*"], () => { void load(); });

  const ack = async (id: string) => {
    await api.post(`/alerts/${id}/ack`);
    setAlerts((prev) => prev.map((a) => (a._id === id ? { ...a, acknowledged: true } : a)));
  };

  const filtered = useMemo(() => alerts.filter((a) => {
    if (filter === "all") return true;
    if (filter === "open") return !a.acknowledged;
    return a.severity === filter;
  }), [alerts, filter]);

  const counts = useMemo(() => {
    let critical = 0, warning = 0, info = 0, open = 0;
    for (const a of alerts) {
      if (!a.acknowledged) open++;
      if (a.severity === "critical") critical++;
      else if (a.severity === "warning") warning++;
      else info++;
    }
    return { critical, warning, info, open, total: alerts.length };
  }, [alerts]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="text-grad">Alerts</span></h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>{counts.open} open · {counts.total} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => ex.download("alerts")} className="btn"><DownloadIcon /> CSV</button>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {([
          { k: "open", label: `Open (${counts.open})` },
          { k: "all", label: `All (${counts.total})` },
          { k: "critical", label: `Critical (${counts.critical})` },
          { k: "warning", label: `Warning (${counts.warning})` },
          { k: "info", label: `Info (${counts.info})` },
        ] as const).map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`btn btn-sm ${filter === f.k ? "btn-primary" : "btn-ghost"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Inbox</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Bin</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">Message</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="No alerts in this view" hint="When sensors trip a rule the alert appears here." icon={<BellIcon />} /></td></tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a._id} className={a.acknowledged ? "opacity-60" : ""}>
                    <td className="px-4 py-2 whitespace-nowrap" style={{ color: "var(--fg-muted)" }}>{new Date(a.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2 font-mono text-xs">{a.dustbinId}</td>
                    <td className="px-4 py-2">{a.type}</td>
                    <td className="px-4 py-2">
                      <Chip tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "info"}>
                        {a.severity}
                      </Chip>
                    </td>
                    <td className="px-4 py-2">{a.message}</td>
                    <td className="px-4 py-2 text-right">
                      {!a.acknowledged ? (
                        <button onClick={() => ack(a._id)} className="btn btn-sm btn-primary"><CheckIcon /> Ack</button>
                      ) : (
                        <Chip tone="success">Acknowledged</Chip>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
