"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { notifications as notif, type NotificationItem } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useT, SUPPORTED_LOCALES } from "@/lib/i18n";
import { BellIcon } from "./Icons";
import { GlobeIcon, MoonIcon, SunIcon, SearchIcon, MenuIcon } from "./IconsExtended";
import { auth } from "@/lib/api";

export function TopBar({ onMobileMenu }: { onMobileMenu: () => void }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { locale, setLocale, t } = useT();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [q, setQ] = useState("");
  const popRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  // ── Admin restart state ──
  const currentUser = auth.current();
  const isAdmin = currentUser?.role === "admin";
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState("");

  // Outside-click closes the popovers — small UX detail that costs nothing.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const refresh = async () => {
    try {
      const c = await notif.unreadCount();
      setUnread(c);
    } catch { /* silent */ }
  };

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 45_000);
    return () => clearInterval(id);
  }, []);

  const openPanel = async () => {
    setOpen((o) => !o);
    if (!open) {
      setLoading(true);
      try {
        const list = await notif.list({ limit: 12 });
        setItems(Array.isArray(list) ? list : []);
      } finally {
        setLoading(false);
      }
    }
  };

  const markAllRead = async () => {
    await notif.markRead([]);
    setUnread(0);
    setItems((arr) => arr.map((x) => ({ ...x, read: true })));
  };

  const quickLinks = [
    { href: "/dashboard", label: t("nav.dashboard") },
    { href: "/analytics", label: t("nav.analytics") },
    { href: "/alerts", label: t("nav.alerts") },
    { href: "/notifications", label: t("nav.notifications") },
    { href: "/surveillance", label: t("nav.surveillance") },
    { href: "/driver", label: t("nav.driver") },
    { href: "/account", label: t("nav.account") },
  ];

  const runSearch = (): void => {
    const needle = q.trim().toLowerCase();
    if (!needle) return;
    if (needle.startsWith("/")) {
      router.push(needle);
      return;
    }
    const found = quickLinks.find((x) => x.label.toLowerCase().includes(needle) || x.href.includes(needle));
    if (found) {
      router.push(found.href);
      return;
    }
    if (pathname !== "/dashboard") {
      router.push(`/dashboard?q=${encodeURIComponent(needle)}`);
    }
  };

    const restartServer = async (): Promise<void> => {
      if (!window.confirm("Restart the backend API server? Active connections will be briefly interrupted.")) return;
      setRestarting(true);
      setRestartMsg("");
      try {
        const token = auth.token() ?? "";
        const r = await fetch("/api/restart-server", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json() as { ok?: boolean; method?: string; error?: string };
        if (r.ok) {
          setRestartMsg(`Restarted via ${j.method ?? "signal"}`);
        } else {
          setRestartMsg(`Error: ${j.error ?? "failed"}`);
        }
      } catch {
        setRestartMsg("Request failed");
      } finally {
        setRestarting(false);
        setTimeout(() => setRestartMsg(""), 5000);
      }
    };

  return (
    <header className="glass mx-3 mt-3 px-4 py-3 flex items-center gap-3 rounded-2xl">
      <button
        onClick={onMobileMenu}
        className="md:hidden h-9 w-9 grid place-items-center rounded-lg hover:bg-white/5"
        aria-label="Open menu"
      >
        <MenuIcon />
      </button>

      {/* Search — flex container with icon + pill Go button. Mobile: icon-only with slide-expand */}
      <div className="relative flex-1 max-w-xl flex items-center gap-2">
        {/* Search icon: absolutely positioned, pointer-events: none */}
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-60"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <SearchIcon />
        </span>
        <input
          type="search"
          placeholder="Search bins, routes, alerts…"
          className="input search-input font-dm-sans"
          style={{ paddingLeft: 40, paddingRight: 72 }}
          aria-label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
        />
        {/* Pill-style Go button */}
        <button
          type="button"
          onClick={runSearch}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 font-dm-sans font-semibold text-xs text-white"
          style={{
            background: "var(--accent-coral)",
            border: "none",
            borderRadius: 20,
            minWidth: 48,
            padding: "5px 12px",
            cursor: "pointer",
            transition: "filter .15s ease",
          }}
          aria-label="Run search"
        >
          Go
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden md:inline-flex items-center gap-2 text-xs" style={{ color: "var(--fg-muted)" }}>
          <span className="live-dot" /> {t("common.live")}
        </span>

          {/* ── Admin-only: restart backend server ── */}
          {isAdmin && (
            <div className="hidden md:flex items-center gap-2">
              {restartMsg && (
                <span
                  className="text-xs font-dm-sans px-2 py-0.5 rounded-full"
                  style={{
                    background: restartMsg.startsWith("E") || restartMsg.startsWith("R") ? "rgba(248,113,113,.15)" : "rgba(52,211,153,.15)",
                    color: restartMsg.startsWith("E") || restartMsg.startsWith("R") ? "var(--danger)" : "var(--success)",
                  }}
                >
                  {restartMsg}
                </span>
              )}
              <button
                onClick={restartServer}
                disabled={restarting}
                title="Restart API server (admin only)"
                aria-label="Restart backend server"
                className="btn btn-ghost flex items-center gap-1.5 font-dm-sans text-xs disabled:opacity-50"
                style={{ color: restarting ? "var(--fg-muted)" : "var(--danger)", borderColor: "rgba(248,113,113,.3)" }}
              >
                {/* Power/restart icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
                <span>{restarting ? "Restarting…" : "Restart API"}</span>
              </button>
            </div>
          )}

        {/* Language */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen((o) => !o)}
            className="btn btn-ghost"
            aria-label="Change language"
            title="Language"
          >
            <GlobeIcon />
            <span className="hidden sm:inline uppercase text-xs">{locale}</span>
          </button>
          {langOpen ? (
            <div className="absolute right-0 mt-2 w-44 glass-strong glass rounded-xl p-1 z-50">
              {SUPPORTED_LOCALES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => { setLocale(l.code); setLangOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-white/5 ${
                    l.code === locale ? "text-white" : ""
                  }`}
                >
                  <span>{l.flag}</span> {l.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Theme toggle with animated icon crossfade */}
        <button onClick={toggle} className="btn btn-ghost" title="Toggle theme" aria-label="Toggle theme">
          <span key={theme} className="theme-icon-enter">
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </span>
        </button>

        {/* Notifications */}
        <div className="relative" ref={popRef}>
        <button
          onClick={openPanel}
          className="btn btn-ghost relative"
          aria-label={`Notifications (${unread} unread)`}
          title="Notifications"
        >
          <BellIcon />
          {unread > 0 ? (
            <span
              className="absolute -top-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--danger)", color: "#fff" }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
          {open ? (
            <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] glass glass-strong rounded-xl overflow-hidden z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="font-semibold text-sm">{t("nav.notifications")}</div>
              <button onClick={markAllRead} className="text-xs hover:underline" style={{ color: "var(--accent)" }}>
                Mark all read
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-2">
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                </div>
              ) : items.length === 0 ? (
                <div className="p-6 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
                  {t("common.empty")}
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {items.map((n) => (
                    <li key={n._id} className={`px-4 py-3 ${n.read ? "" : "bg-white/[0.03]"}`}>
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-1 h-2 w-2 rounded-full shrink-0"
                          style={{
                            background:
                              n.severity === "critical" ? "var(--danger)" :
                              n.severity === "warning" ? "var(--warning)" :
                              n.severity === "success" ? "var(--success)" : "var(--info)",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{n.title}</div>
                          {n.body ? (
                            <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--fg-muted)" }}>
                              {n.body}
                            </div>
                          ) : null}
                          <div className="text-[10px] mt-1" style={{ color: "var(--fg-subtle)" }}>
                            {new Date(n.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-[var(--border)] p-2 text-center">
              <Link href="/notifications" className="text-xs hover:underline" style={{ color: "var(--accent)" }}>
                View all notifications →
              </Link>
            </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
