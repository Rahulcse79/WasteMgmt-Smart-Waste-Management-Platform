"use client";
import { reportsApi, reports as reportsAdmin, exports as ex, type CitizenReport } from "@/lib/api";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Card, CardBody, CardHeader, CardTitle, Chip, EmptyState, Skeleton } from "@/components/ui/Primitives";
import { Pagination } from "@/components/ui/Pagination";
import { FileTextIcon, DownloadIcon } from "@/components/IconsExtended";

const STATUSES: CitizenReport["status"][] = ["NEW", "TRIAGED", "RESOLVED", "REJECTED"];

type ReportFilters = { status?: CitizenReport["status"]; category?: string; q?: string };

export default function AdminReportsPage(): React.ReactElement {
  const list = usePaginatedList<CitizenReport, ReportFilters>({
    fetcher: (args) => reportsApi.page(args),
    initialFilters: { status: "NEW" },
  });

  const updateStatus = async (id: string, s: CitizenReport["status"]) => {
    await reportsAdmin.update(id, s);
    list.refresh();
  };

  const activeStatus = list.filters.status ?? "ALL";

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

      <div className="flex items-center gap-2 flex-wrap">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => list.setFilters((f) => ({ ...f, status: s === "ALL" ? undefined : s }))}
            className={`btn btn-sm ${activeStatus === s ? "btn-primary" : "btn-ghost"}`}
          >
            {s}
          </button>
        ))}
        <input
          placeholder="Search description / contact / dustbin…"
          value={list.filters.q ?? ""}
          onChange={(e) => list.setFilters((f) => ({ ...f, q: e.target.value || undefined }))}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-1.5 text-xs w-72"
        />
      </div>

      {list.error ? <div className="chip danger">{list.error}</div> : null}

      <Card>
        <CardHeader><CardTitle>Inbox</CardTitle></CardHeader>
        <CardBody className="p-0">
          {list.initialLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : list.items.length === 0 ? (
            <EmptyState title="No reports for this filter" icon={<FileTextIcon />} />
          ) : (
            <ul className={`divide-y ${list.loading ? "opacity-70 transition" : "transition"}`} style={{ borderColor: "var(--border)" }}>
              {list.items.map((r) => (
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
                          <a
                            href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                            style={{ color: "var(--accent)" }}
                          >
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
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            loading={list.loading}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
          />
        </CardBody>
      </Card>
    </div>
  );
}
