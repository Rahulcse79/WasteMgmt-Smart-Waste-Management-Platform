"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, notifications as notif } from "@/lib/api";
import {
  HomeIcon,
  CameraIcon,
  UsersIcon,
  TrashIcon,
  ScrollIcon,
  ShieldIcon,
  BellIcon,
  LogOutIcon,
  SettingsIcon,
} from "./Icons";
import {
  ChartIcon,
  TruckIcon,
  RouteIcon,
  FileTextIcon,
  SparklesIcon,
  MenuIcon,
} from "./IconsExtended";
import { useT } from "@/lib/i18n";

interface Item {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const items: Item[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: <HomeIcon /> },
  { href: "/analytics", labelKey: "nav.analytics", icon: <ChartIcon /> },
  { href: "/alerts", labelKey: "nav.alerts", icon: <BellIcon /> },
  { href: "/notifications", labelKey: "nav.notifications", icon: <SparklesIcon /> },
  { href: "/surveillance", labelKey: "nav.surveillance", icon: <CameraIcon /> },
  { href: "/driver", labelKey: "nav.driver", icon: <TruckIcon /> },
  { href: "/account", labelKey: "nav.account", icon: <UsersIcon /> },
  { href: "/admin/dustbins", labelKey: "nav.dustbins", icon: <TrashIcon />, adminOnly: true },
  { href: "/admin/users", labelKey: "nav.users", icon: <UsersIcon />, adminOnly: true },
  { href: "/admin/cameras", labelKey: "nav.cameras", icon: <CameraIcon />, adminOnly: true },
  { href: "/admin/rules", labelKey: "nav.rules", icon: <ShieldIcon />, adminOnly: true },
  { href: "/admin/routes", labelKey: "nav.routes", icon: <RouteIcon />, adminOnly: true },
  { href: "/admin/reports", labelKey: "nav.reports", icon: <FileTextIcon />, adminOnly: true },
  { href: "/admin/audit", labelKey: "nav.audit", icon: <ScrollIcon />, adminOnly: true },
  { href: "/admin/settings", labelKey: "nav.settings", icon: <SettingsIcon />, adminOnly: true },
];

const COLLAPSE_KEY = "wm.sidebar.collapsed";

export function Sidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [username, setUsername] = useState<string>("");
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState<number>(0);

  useEffect(() => {
    const u = auth.current();
    setRole(u?.role ?? null);
    setUsername(u?.username ?? "");
    if (typeof window !== "undefined") {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    }
  }, []);

  // Periodic unread-notification poll keeps the badge honest. Cheap (~1 req/min).
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const c = await notif.unreadCount(); if (alive) setUnread(c); } catch { /* silent */ }
    };
    void tick();
    const id = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const onLogout = () => {
    auth.logout();
    router.replace("/login");
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== "undefined") window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };

  const width = collapsed ? "w-[68px]" : "w-64";

  return (
    <>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={`
          ${width} shrink-0 flex flex-col glass m-3 rounded-2xl overflow-hidden
          transition-[width] duration-200
          fixed md:static z-50 inset-y-3 left-3 md:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-[110%] md:translate-x-0"}
        `}
        aria-label="Primary navigation"
      >
        <div className="px-4 pt-5 pb-5 flex items-center gap-3 border-b border-[var(--border)]">
          <div
            className="relative h-10 w-10 rounded-xl overflow-hidden ring-grad grid place-items-center shadow-lg"
            style={{ background: "var(--accent-grad)" }}
          >
            <Image src="/logo.jpeg" alt="Coral Telecom" fill sizes="40px" className="logo-img object-contain p-1" priority />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <div className="font-syne font-bold tracking-tight text-sm truncate" style={{ color: "var(--color-text-primary)" }}>Coral Telecom</div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-dm-sans" style={{ color: "var(--fg-muted)" }}>
                Smart Waste · Ops
              </div>
            </div>
          ) : null}
          <button
            onClick={toggleCollapsed}
            className="ml-auto hidden md:inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/5"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <MenuIcon />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {items
            .filter((i) => !i.adminOnly || role === "admin")
            .map((i) => {
              const active = pathname === i.href || pathname.startsWith(i.href + "/");
              const showBadge = i.href === "/notifications" && unread > 0;
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={onMobileClose}
                  title={collapsed ? t(i.labelKey) : undefined}
                  className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                    active
                      ? "nav-active font-medium"
                      : "hover:bg-white/5"
                  }`}
                  style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r nav-active-bar"
                    />
                  ) : null}
                  <span
                    style={{ color: active ? "var(--color-accent)" : "var(--color-text-secondary)" }}
                    className="transition-transform duration-150 group-hover:scale-110"
                  >
                    {i.icon}
                  </span>
                  {!collapsed ? <span className="truncate">{t(i.labelKey)}</span> : null}
                  {showBadge && !collapsed ? (
                    <span
                      className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--danger)", color: "#fff" }}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                  {showBadge && collapsed ? (
                    <span
                      aria-hidden
                      className="absolute right-1 top-1 h-2 w-2 rounded-full"
                      style={{ background: "var(--danger)" }}
                    />
                  ) : null}
                </Link>
              );
            })}
        </nav>

        <div className="px-3 py-3 border-t border-[var(--border)]">
          {!collapsed ? (
            <>
              <div className="flex items-center justify-between gap-2 mb-2 px-1">
                <div className="text-xs truncate">
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--fg-subtle)" }}>
                    {t("common.signedInAs")}
                  </div>
                  <div className="font-medium truncate">{username || "—"}</div>
                </div>
                <span className={`chip ${role === "admin" ? "warning" : "info"}`}>{role ?? "—"}</span>
              </div>
              <button onClick={onLogout} className="btn btn-ghost w-full">
                <LogOutIcon /> {t("common.signOut")}
              </button>
            </>
          ) : (
            <button onClick={onLogout} className="btn btn-ghost w-full px-0" aria-label="Sign out">
              <LogOutIcon />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
