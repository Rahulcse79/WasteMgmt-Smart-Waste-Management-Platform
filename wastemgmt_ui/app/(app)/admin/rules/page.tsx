"use client";
import { useState } from "react";
import { rulesApi, type RuleRow } from "@/lib/api";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Pagination } from "@/components/ui/Pagination";

const empty: Omit<RuleRow, "_id" | "appliesToDustbinIds"> = {
  name: "",
  enabled: true,
  metric: "depth",
  operator: "gte",
  threshold: 80,
  severity: "warning",
  alertType: "BIN_FULL",
  notifyEmail: false,
  cooldownSec: 300,
};

type RuleFilters = { metric?: string; enabled?: "true" | "false" };

export default function AdminRulesPage(): React.ReactElement {
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState<string | null>(null);

  const list = usePaginatedList<RuleRow, RuleFilters>({
    fetcher: (args) => rulesApi.page(args),
  });

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr(null);
    try {
      await rulesApi.create(form);
      setForm(empty);
      list.refresh();
    } catch (e) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Create failed");
    }
  }

  async function toggle(r: RuleRow): Promise<void> {
    await rulesApi.update(r._id, { enabled: !r.enabled });
    list.refresh();
  }

  async function remove(r: RuleRow): Promise<void> {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    await rulesApi.remove(r._id);
    list.refresh();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-white">Alert rules</h1>

      <form
        onSubmit={create}
        className="rounded-xl bg-[var(--panel)] border border-[var(--border)] p-4 grid grid-cols-1 md:grid-cols-7 gap-3 text-sm"
      >
        <input
          required
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 md:col-span-2"
        />
        <select
          value={form.metric}
          onChange={(e) => setForm({ ...form, metric: e.target.value as RuleRow["metric"] })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-2 py-2"
        >
          <option value="depth">depth</option>
          <option value="gas">gas</option>
          <option value="humidity">humidity</option>
          <option value="temperature">temperature</option>
        </select>
        <select
          value={form.operator}
          onChange={(e) => setForm({ ...form, operator: e.target.value as RuleRow["operator"] })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-2 py-2"
        >
          <option value="gt">&gt;</option>
          <option value="gte">≥</option>
          <option value="lt">&lt;</option>
          <option value="lte">≤</option>
          <option value="eq">=</option>
        </select>
        <input
          required
          type="number"
          step="any"
          placeholder="Threshold"
          value={form.threshold}
          onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2"
        />
        <select
          value={form.severity}
          onChange={(e) => setForm({ ...form, severity: e.target.value as RuleRow["severity"] })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-2 py-2"
        >
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="critical">critical</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-semibold"
        >
          Add rule
        </button>
        <label className="md:col-span-7 flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={form.notifyEmail}
            onChange={(e) => setForm({ ...form, notifyEmail: e.target.checked })}
          />
          Send email when this rule fires
        </label>
        {err ? <div className="md:col-span-7 text-rose-300 text-xs">{err}</div> : null}
      </form>

      {/* Server-side filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={list.filters.metric ?? ""}
          onChange={(e) => list.setFilters((f) => ({ ...f, metric: e.target.value || undefined }))}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        >
          <option value="">All metrics</option>
          <option value="depth">depth</option>
          <option value="gas">gas</option>
          <option value="humidity">humidity</option>
          <option value="temperature">temperature</option>
        </select>
        <select
          value={list.filters.enabled ?? ""}
          onChange={(e) =>
            list.setFilters((f) => ({
              ...f,
              enabled: (e.target.value || undefined) as "true" | "false" | undefined,
            }))
          }
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        >
          <option value="">All states</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </div>

      <div className="rounded-xl bg-[var(--panel)] border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Condition</th>
              <th className="px-4 py-2 text-left">Severity</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-center">Enabled</th>
              <th className="px-4 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {list.initialLoading ? (
              <tr><td colSpan={6} className="text-center text-zinc-500 py-6">Loading…</td></tr>
            ) : list.items.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-zinc-500 py-6">No rules.</td></tr>
            ) : (
              list.items.map((r) => (
                <tr key={r._id} className={list.loading ? "opacity-60 transition" : "transition"}>
                  <td className="px-4 py-2 text-white">{r.name}</td>
                  <td className="px-4 py-2 text-zinc-200">
                    {r.metric} {r.operator} {r.threshold}
                  </td>
                  <td className="px-4 py-2 text-zinc-200">{r.severity}</td>
                  <td className="px-4 py-2 text-zinc-300">{r.notifyEmail ? "✓" : "—"}</td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => toggle(r)}
                      className={`text-xs px-2 py-1 rounded ${r.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-500/20 text-zinc-300"}`}
                    >
                      {r.enabled ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => remove(r)} className="text-xs text-rose-300 hover:text-rose-100">
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
