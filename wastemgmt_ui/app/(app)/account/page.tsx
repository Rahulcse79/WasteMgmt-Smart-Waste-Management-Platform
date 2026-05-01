"use client";
import { useEffect, useState } from "react";
import { api, auth } from "@/lib/api";

interface Me {
  _id: string;
  username: string;
  role: "admin" | "user";
  email?: string;
  assignedDustbins?: string[];
  lastLoginAt?: string;
}

export default function AccountPage(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load(): Promise<void> {
    const r = await api.get<{ user: Me }>("/auth/me");
    setMe(r.data.user);
    setEmail(r.data.user.email ?? "");
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveEmail(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setEmailMsg(null);
    try {
      await api.patch("/auth/me", { email });
      setEmailMsg({ type: "ok", text: "Email updated. A confirmation has been sent." });
      // Refresh the cached user record so other pages see the new email.
      const cur = auth.current();
      if (cur && typeof window !== "undefined") {
        window.localStorage.setItem("wm.user", JSON.stringify({ ...cur, email }));
      }
      await load();
    } catch (err) {
      const x = err as { response?: { data?: { error?: string } } };
      setEmailMsg({ type: "err", text: x?.response?.data?.error ?? "Update failed" });
    }
  }

  async function savePassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setPwdMsg(null);
    if (pwd.next.length < 4) {
      setPwdMsg({ type: "err", text: "New password must be at least 4 characters." });
      return;
    }
    if (pwd.next !== pwd.confirm) {
      setPwdMsg({ type: "err", text: "New passwords do not match." });
      return;
    }
    try {
      await api.post("/auth/me/password", {
        currentPassword: pwd.current,
        newPassword: pwd.next,
      });
      setPwdMsg({ type: "ok", text: "Password changed successfully." });
      setPwd({ current: "", next: "", confirm: "" });
    } catch (err) {
      const x = err as { response?: { data?: { error?: string } } };
      setPwdMsg({ type: "err", text: x?.response?.data?.error ?? "Change failed" });
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-white">Your account</h1>

      <section className="rounded-xl bg-[var(--panel)] border border-[var(--border)] p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <div className="text-xs text-zinc-500">Username</div>
            <div className="text-white">{me?.username ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Role</div>
            <div className="text-white capitalize">{me?.role ?? "—"}</div>
          </div>
        </div>

        <form onSubmit={saveEmail} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Email (alerts will be sent here)</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-semibold"
          >
            Save email
          </button>
        </form>
        {emailMsg ? (
          <p className={`text-xs mt-2 ${emailMsg.type === "ok" ? "text-emerald-300" : "text-rose-300"}`}>
            {emailMsg.text}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl bg-[var(--panel)] border border-[var(--border)] p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">Change password</h2>
        <form onSubmit={savePassword} className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Current password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={pwd.current}
              onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
              className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">New password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={pwd.next}
                onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Confirm new password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={pwd.confirm}
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
                className="w-full bg-[var(--panel-2)] border border-[var(--border)] rounded px-3 py-2"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-semibold"
            >
              Update password
            </button>
          </div>
          {pwdMsg ? (
            <p className={`text-xs ${pwdMsg.type === "ok" ? "text-emerald-300" : "text-rose-300"}`}>
              {pwdMsg.text}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
