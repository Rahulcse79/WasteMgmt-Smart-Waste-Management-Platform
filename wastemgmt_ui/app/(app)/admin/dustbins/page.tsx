"use client";
import { useState } from "react";
import { dustbinsApi, type DustbinRow } from "@/lib/api";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination } from "@/components/ui/Pagination";

interface FormState {
  dustbinId: string;
  dustbinName: string;
  latitude: string;
  longitude: string;
  zone: string;
}

const empty: FormState = { dustbinId: "", dustbinName: "", latitude: "", longitude: "", zone: "" };

type DustbinFilters = { q?: string; status?: "online" | "offline" };

export default function AdminDustbinsPage(): React.ReactElement {
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = usePaginatedList<DustbinRow, DustbinFilters>({
    fetcher: (args) => dustbinsApi.page(args),
  });

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await dustbinsApi.upsert({
        dustbinId: form.dustbinId,
        dustbinName: form.dustbinName,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        zone: form.zone,
      });
      setForm(empty);
      list.refresh();
    } catch (e) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    if (!confirm(`Delete ${id}?`)) return;
    await dustbinsApi.remove(id);
    list.refresh();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-white">Dustbins</h1>

      <form
        onSubmit={submit}
        className="rounded-xl bg-[var(--panel)] border border-[var(--border)] p-4 grid grid-cols-1 md:grid-cols-6 gap-3"
      >
        <input
          required
          placeholder="ID (e.g. RGGP-01)"
          value={form.dustbinId}
          onChange={(e) => setForm({ ...form, dustbinId: e.target.value })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Name"
          value={form.dustbinName}
          onChange={(e) => setForm({ ...form, dustbinName: e.target.value })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm md:col-span-2"
        />
        <input
          required
          placeholder="Latitude"
          type="number"
          step="any"
          value={form.latitude}
          onChange={(e) => setForm({ ...form, latitude: e.target.value })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Longitude"
          type="number"
          step="any"
          value={form.longitude}
          onChange={(e) => setForm({ ...form, longitude: e.target.value })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        />
        <input
          placeholder="Zone (optional)"
          value={form.zone}
          onChange={(e) => setForm({ ...form, zone: e.target.value })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        />
        <div className="md:col-span-6 flex items-center justify-between">
          {err ? <span className="text-rose-300 text-xs">{err}</span> : <span />}
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add / update"}
          </button>
        </div>
      </form>

      {/* Filters: server-side search + status */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Search ID / name / zone…"
          value={list.filters.q ?? ""}
          onChange={(e) => list.setFilters((f) => ({ ...f, q: e.target.value }))}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm w-72"
        />
        <select
          value={list.filters.status ?? ""}
          onChange={(e) =>
            list.setFilters((f) => ({
              ...f,
              status: (e.target.value || undefined) as "online" | "offline" | undefined,
            }))
          }
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      <div className="rounded-xl bg-[var(--panel)] border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Coordinates</th>
              <th className="px-4 py-3 text-left">Zone</th>
              <th className="px-4 py-3 text-center">Online</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {list.initialLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Loading…</td>
              </tr>
            ) : list.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  {list.error ?? "No dustbins match the current filters."}
                </td>
              </tr>
            ) : (
              list.items.map((d) => (
                <tr key={d.dustbinId} className={list.loading ? "opacity-60 transition" : "transition"}>
                  <td className="px-4 py-2 text-white">{d.dustbinId}</td>
                  <td className="px-4 py-2 text-zinc-200">{d.dustbinName}</td>
                  <td className="px-4 py-2 text-zinc-300">
                    {d.latitude.toFixed(6)}, {d.longitude.toFixed(6)}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">{d.zone || "—"}</td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        d.online ? "bg-emerald-400" : "bg-zinc-500"
                      }`}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => remove(d.dustbinId)}
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
