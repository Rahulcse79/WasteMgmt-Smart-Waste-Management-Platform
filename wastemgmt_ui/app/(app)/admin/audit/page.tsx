"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface AuditEntry {
  _id: string;
  actorUsername?: string;
  actorRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ip?: string;
  createdAt: string;
}

export default function AuditPage(): React.ReactElement {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.get<AuditEntry[]>("/audit");
      setItems(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function removeEntry(id: string): Promise<void> {
    if (!confirm("Delete this audit record?")) return;
    try {
      await api.delete(`/audit/${id}`);
      setItems((arr) => arr.filter((x) => x._id !== id));
    } catch (e) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Delete failed");
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-white mb-4">Audit log</h1>
      <div className="flex items-center justify-between mb-3">
        {err ? <div className="text-xs text-rose-300">{err}</div> : <span />}
        <button onClick={() => void refresh()} className="btn btn-sm">Refresh</button>
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
            {items.map((a) => (
              <tr key={a._id}>
                <td className="px-4 py-2 text-zinc-300">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-white">
                  {a.actorUsername ?? "—"}{" "}
                  <span className="text-xs text-zinc-500">({a.actorRole ?? "?"})</span>
                </td>
                <td className="px-4 py-2 text-cyan-300 font-mono text-xs">{a.action}</td>
                <td className="px-4 py-2 text-zinc-200">{a.resource}</td>
                <td className="px-4 py-2 text-zinc-400 font-mono text-xs">{a.resourceId ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-400 font-mono text-xs">{a.ip ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => void removeEntry(a._id)} className="text-xs text-rose-300 hover:text-rose-100">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-zinc-500 py-6">
                  No audit entries yet.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="text-center text-zinc-500 py-6">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
