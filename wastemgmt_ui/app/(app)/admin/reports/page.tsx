"use client";
import { useEffect, useState } from "react";
import { reports, type CitizenReport, exports as ex } from "@/lib/api";
import { Card, CardBody, CardHeader, CardTitle, Chip, EmptyState, Skeleton } from "@/components/ui/Primitives";
import { FileTextIcon, DownloadIcon } from "@/components/IconsExtended";

const STATUSES: CitizenReport["status"][] = ["NEW", "TRIAGED", "RESOLVED", "REJECTED"];

export default function AdminReportsPage(): React.ReactElement {
  const [items, setItems] = useState<CitizenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CitizenReport["status"] | "ALL">("NEW");
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      setItems(await reports.list({ status: filter === "ALL" ? undefined : filter, limit: 200 }));
    } catch (e) {
      const ex = e as { response?: { data?: { error?: string } } };
      setErr(ex?.response?.data?.error ?? "Failed to load reports");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  const updateStatus = async (id: string, s: CitizenReport["status"]) => {
    const prev = items;
    setItems((arr) => arr.map((r) => (r._id === id ? { ...r, status: s } : r)));
    try { await reports.update(id, s); } catch { setItems(prev); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="text-grad">Citizen reports</span></h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>Triage, resolve, and export incoming reports.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => ex.download("citizen-reports")} className="btn"><DownloadIcon /> CSV</button>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-ghost"}`}>
            {s}
          </button>
        ))}
      </div>

      {err ? <div className="chip danger">{err}</div> : null}

      <Card>
        <CardHeader><CardTitle>Inbox</CardTitle><span className="chip">{items.length}</span></CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="No reports for this filter" icon={<FileTextIcon />} />
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {items.map((r) => (
                <li key={r._id} className="px-5 py-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium">{r.category.replace("_", " ")}</span>
                        <Chip tone={r.status === "NEW" ? "warning" : r.status === "RESOLVED" ? "success" : r.status === "REJECTED" ? "danger" : "info"}>
                          {r.status}
                        </Chip>
                        {r.dustbinId ? <Chip>{r.dustbinId}</Chip> : null}
                      </div>
                      <div className="text-sm" style={{ color: "var(--fg)" }}>{r.description}</div>
                      <div className="text-[11px] mt-1 flex items-center gap-3 flex-wrap" style={{ color: "var(--fg-subtle)" }}>
                        <span>{new Date(r.createdAt).toLocaleString()}</span>
                        {r.lat != null && r.lng != null ? (
                          <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer"
                             className="hover:underline" style={{ color: "var(--accent)" }}>
                            {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                          </a>
                        ) : null}
                        {r.contactEmail || r.contactPhone ? <span>{r.contactEmail ?? r.contactPhone}</span> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {STATUSES.filter((s) => s !== r.status).map((s) => (
                        <button key={s} onClick={() => updateStatus(r._id, s)} className="btn btn-sm">{s}</button>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
