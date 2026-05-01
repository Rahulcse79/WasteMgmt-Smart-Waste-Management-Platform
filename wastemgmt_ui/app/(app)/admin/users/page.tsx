"use client";
import { useEffect, useState } from "react";
import { api, auth } from "@/lib/api";

interface AdminUser {
  _id: string;
  username: string;
  role: "admin" | "user";
  email?: string;
  assignedDustbins?: string[];
  isActive?: boolean;
  lastLoginAt?: string;
}

export default function AdminUsersPage(): React.ReactElement {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState({ username: "", password: "", role: "user" as "admin" | "user", email: "" });
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [savingEmailFor, setSavingEmailFor] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const currentUser = auth.current();

  async function refresh(): Promise<void> {
    const r = await api.get<AdminUser[]>("/users");
    const list = Array.isArray(r.data) ? r.data : [];
    setUsers(list);
    setEmailDrafts(Object.fromEntries(list.map((u) => [u._id, u.email ?? ""])));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr(null);
    try {
      await api.post("/users", {
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        email: form.email.trim() ? form.email.trim() : undefined,
      });
      setForm({ username: "", password: "", role: "user", email: "" });
      await refresh();
    } catch (e) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Create failed");
    }
  }

  async function reset(id: string): Promise<void> {
    const res = await api.post<{ newPassword: string }>(`/users/${id}/reset-password`, {});
    setResetMsg(`New password: ${res.data.newPassword}`);
  }

  async function remove(id: string): Promise<void> {
    if (!confirm("Delete this user?")) return;
    await api.delete(`/users/${id}`);
    await refresh();
  }

  async function updateEmail(id: string): Promise<void> {
    const nextEmail = (emailDrafts[id] ?? "").trim();
    setErr(null);
    setSavingEmailFor(id);
    try {
      await api.patch(`/users/${id}`, { email: nextEmail || undefined });
      if (currentUser?.id === id && typeof window !== "undefined") {
        const userRaw = window.localStorage.getItem("wm.user");
        if (userRaw) {
          const parsed = JSON.parse(userRaw) as Record<string, unknown>;
          parsed.email = nextEmail || undefined;
          window.localStorage.setItem("wm.user", JSON.stringify(parsed));
        }
      }
      await refresh();
    } catch (e) {
      const x = e as { response?: { data?: { error?: string } } };
      setErr(x?.response?.data?.error ?? "Email update failed");
    } finally {
      setSavingEmailFor(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-white">Users</h1>

      <form
        onSubmit={create}
        className="rounded-xl bg-[var(--panel)] border border-[var(--border)] p-4 grid grid-cols-1 md:grid-cols-5 gap-3"
      >
        <input
          required
          placeholder="username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        />
        <input
          required
          type="password"
          placeholder="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        />
        <input
          placeholder="email (optional)"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "user" })}
          className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        >
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-semibold"
        >
          Create
        </button>
        {err ? <div className="md:col-span-5 text-rose-300 text-xs">{err}</div> : null}
      </form>

      {resetMsg ? (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-amber-200 text-sm">
          {resetMsg}
        </div>
      ) : null}

      <div className="rounded-xl bg-[var(--panel)] border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Username</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Last login</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.map((u) => (
              <tr key={u._id}>
                <td className="px-4 py-2 text-white">{u.username}</td>
                <td className="px-4 py-2 text-zinc-300">
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={emailDrafts[u._id] ?? ""}
                      onChange={(e) => setEmailDrafts((prev) => ({ ...prev, [u._id]: e.target.value }))}
                      placeholder="email@company.com"
                      className="bg-[var(--panel-2)] border border-[var(--border)] rounded px-2 py-1 text-xs min-w-[200px]"
                    />
                    <button
                      onClick={() => void updateEmail(u._id)}
                      disabled={savingEmailFor === u._id}
                      className="text-xs text-emerald-300 hover:text-emerald-100"
                    >
                      {savingEmailFor === u._id ? "Saving..." : "Update"}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wide ${
                      u.role === "admin" ? "bg-amber-500/20 text-amber-300" : "bg-cyan-500/20 text-cyan-300"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-300">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2 text-center space-x-3">
                  <button
                    onClick={() => reset(u._id)}
                    className="text-xs text-cyan-300 hover:text-cyan-100"
                  >
                    Reset password
                  </button>
                  <button
                    onClick={() => remove(u._id)}
                    className="text-xs text-rose-300 hover:text-rose-100"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
