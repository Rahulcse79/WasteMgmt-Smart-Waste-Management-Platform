"use client";
import { useEffect, useState } from "react";
import { notifications as notif, type NotificationItem } from "@/lib/api";
import { Card, CardBody, CardHeader, CardTitle, Chip, EmptyState, Skeleton } from "@/components/ui/Primitives";
import { BellIcon } from "@/components/Icons";
import { CheckIcon } from "@/components/IconsExtended";

export default function NotificationsPage(): React.ReactElement {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = async () => {
    setLoading(true);
    try {
      setItems(await notif.list({ unread: filter === "unread", limit: 100 }));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  const markAll = async () => {
    await notif.markRead([]);
    setItems((arr) => arr.map((x) => ({ ...x, read: true })));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="text-grad">Notifications</span></h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>System alerts, citizen reports, and account events.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFilter("all")} className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`}>All</button>
          <button onClick={() => setFilter("unread")} className={`btn btn-sm ${filter === "unread" ? "btn-primary" : "btn-ghost"}`}>Unread</button>
          <button onClick={markAll} className="btn btn-sm"><CheckIcon /> Mark all read</button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Inbox</CardTitle><span className="chip">{items.length} item{items.length === 1 ? "" : "s"}</span></CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="You're all caught up" hint="No notifications match this filter." icon={<BellIcon />} />
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {items.map((n) => (
                <li key={n._id} className={`px-5 py-4 ${n.read ? "" : "bg-white/[0.025]"}`}>
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-2 h-2 w-2 rounded-full shrink-0"
                      style={{
                        background:
                          n.severity === "critical" ? "var(--danger)" :
                          n.severity === "warning" ? "var(--warning)" :
                          n.severity === "success" ? "var(--success)" : "var(--info)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-medium">{n.title}</span>
                        <Chip tone={n.severity === "critical" ? "danger" : n.severity === "warning" ? "warning" : n.severity === "success" ? "success" : "info"}>
                          {n.category}
                        </Chip>
                        {!n.read ? <Chip tone="info">new</Chip> : null}
                      </div>
                      {n.body ? <div className="text-sm" style={{ color: "var(--fg-muted)" }}>{n.body}</div> : null}
                      <div className="text-[11px] mt-1" style={{ color: "var(--fg-subtle)" }}>
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
