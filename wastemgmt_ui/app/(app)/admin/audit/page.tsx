"use client";
import { auditApi, type AuditRow } from "@/lib/api";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination } from "@/components/ui/Pagination";

type AuditFilters = { resource?: string; action?: string; q?: string };

export default function AuditPage(): React.ReactElement {
  const list = usePaginatedList<AuditRow, AuditFilters>({
    fetcher: (args) => auditApi.page(args),
  });

  async function removeEntry(id: string): Promise<void> {
    if (!confirm("Delete this audit record?")) return;
    await auditApi.remove(id);
    list.refresh();
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-white mb-4">Audit log</h1>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          placeholder="Search actor / resource / action…"
          value={list.filters.q ?? ""}
          onChange={(e) => list.setFilters((f) => ({ ...f, q: e.target.value }))}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm w-72"
        />
        <input
          placeholder="resource (e.g. dustbin)"
          value={list.filters.resource ?? ""}
          onChange={(e) => list.setFilters((f) => ({ ...f, resource: e.target.value || undefined }))}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm w-48"
        />
        <input
          placeholder="action (e.g. user.delete)"
          value={list.filters.action ?? ""}
          onChange={(e) => list.setFilters((f) => ({ ...f, action: e.target.value || undefined }))}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm w-48"
        />
        <button onClick={list.refresh} className="btn btn-sm">Refresh</button>
        {list.error ? <span className="text-xs text-rose-300">{list.error}</span> : null}
      </div>

      <div className="rounded-xl bg-[var(--panel)] border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Time</th>
              <th className="px-4 py-2 text-left">Actor</th>
              <th className="px-4 py-2 text-left">Action</th>
              <th className="px-4 py-2 text-left">Resource</th>
              <th className="px-4 py-2 text-left">Resource ID</th>
              <th className="px-4 py-2 text-left">IP</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {list.initialLoading ? (
              <tr><td colSpan={7} className="text-center text-zinc-500 py-6">Loading…</td></tr>
            ) : list.items.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-zinc-500 py-6">No audit entries.</td></tr>
            ) : (
              list.items.map((a) => (
                <tr key={a._id} className={list.loading ? "opacity-60 transition" : "transition"}>
                  <td className="px-4 py-2 text-zinc-300">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-white">
                    {a.actor?.username ?? a.actorUsername ?? "—"}{" "}
                    <span className="text-xs text-zinc-500">({a.actor?.role ?? "?"})</span>
                  </td>
                  <td className="px-4 py-2 text-cyan-300 font-mono text-xs">{a.action}</td>
                  <td className="px-4 py-2 text-zinc-200">{a.resource}</td>
                  <td className="px-4 py-2 text-zinc-400 font-mono text-xs">{a.resourceId ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-400 font-mono text-xs">{a.ip ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => void removeEntry(a._id)}
                      className="text-xs text-rose-300 hover:text-rose-100"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          loading={list.loading}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
        />
      </div>
    </div>
  );
}
