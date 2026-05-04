"use client";
import { alertsApi, exports as ex, type AlertRow } from "@/lib/api";
import { useLiveSocket } from "@/lib/socket";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Card, CardHeader, CardTitle, Chip, EmptyState, Skeleton } from "@/components/ui/Primitives";
import { Pagination } from "@/components/ui/Pagination";
import { BellIcon } from "@/components/Icons";
import { CheckIcon, DownloadIcon } from "@/components/IconsExtended";

type AlertFilters = {
  acknowledged?: "true" | "false";
  severity?: AlertRow["severity"];
  type?: string;
  dustbinId?: string;
};

export default function AlertsPage(): React.ReactElement {
  const list = usePaginatedList<AlertRow, AlertFilters>({
    fetcher: (args) => alertsApi.page(args),
    initialFilters: { acknowledged: "false" },
  });

  // Re-poll on any inbound bin event — alerts may have been raised on the server.
  useLiveSocket(["dustbin:*"], () => list.refresh());

  const ack = async (id: string) => {
    await alertsApi.ack(id);
    list.refresh();
  };

  // Quick-filter chip toolbar — sets server-side filters, never client-side.
  const setView = (v: "open" | "all" | AlertRow["severity"]) => {
    if (v === "open") list.setFilters({ acknowledged: "false" });
    else if (v === "all") list.setFilters({});
    else list.setFilters({ severity: v });
  };

  const activeView: "open" | "all" | AlertRow["severity"] =
    list.filters.severity ?? (list.filters.acknowledged === "false" ? "open" : "all");

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="text-grad">Alerts</span></h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            {list.total >= 0 ? `${list.total.toLocaleString()} matching` : "Live"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => ex.download("alerts")} className="btn"><DownloadIcon /> CSV</button>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {([
          { k: "open", label: "Open" },
          { k: "all", label: "All" },
          { k: "critical", label: "Critical" },
          { k: "warning", label: "Warning" },
          { k: "info", label: "Info" },
        ] as const).map((f) => (
          <button
            key={f.k}
            onClick={() => setView(f.k as "open" | "all" | AlertRow["severity"])}
            className={`btn btn-sm ${activeView === f.k ? "btn-primary" : "btn-ghost"}`}
          >
            {f.label}
          </button>
        ))}
        <input
          placeholder="dustbinId"
          value={list.filters.dustbinId ?? ""}
          onChange={(e) => list.setFilters((f) => ({ ...f, dustbinId: e.target.value || undefined }))}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-1.5 text-xs ml-2"
        />
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
              {list.initialLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : list.items.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="No alerts in this view"
                      hint="When sensors trip a rule the alert appears here."
                      icon={<BellIcon />}
                    />
                  </td>
                </tr>
              ) : (
                list.items.map((a) => (
                  <tr key={a._id} className={`${a.acknowledged ? "opacity-60" : ""} ${list.loading ? "transition opacity-80" : ""}`}>
                    <td className="px-4 py-2 whitespace-nowrap" style={{ color: "var(--fg-muted)" }}>
                      {new Date(a.createdAt).toLocaleString()}
                    </td>
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
        <Pagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          loading={list.loading}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      </Card>
    </div>
  );
}
