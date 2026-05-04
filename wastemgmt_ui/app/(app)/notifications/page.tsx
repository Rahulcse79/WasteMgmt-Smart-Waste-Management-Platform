"use client";
import { notificationsApi, notifications as notif, type NotificationItem } from "@/lib/api";
import { usePaginatedList } from "@/lib/usePaginatedList";
import { Card, CardBody, CardHeader, CardTitle, Chip, EmptyState, Skeleton } from "@/components/ui/Primitives";
import { Pagination } from "@/components/ui/Pagination";
import { BellIcon } from "@/components/Icons";
import { CheckIcon } from "@/components/IconsExtended";

type NotifFilters = { unread?: "true" | "false" };

export default function NotificationsPage(): React.ReactElement {
  const list = usePaginatedList<NotificationItem, NotifFilters>({
    fetcher: (args) => notificationsApi.page(args),
  });

  const isUnreadFilter = list.filters.unread === "true";

  const markAll = async () => {
    await notif.markRead([]);
    list.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight"><span className="text-grad">Notifications</span></h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>System alerts, citizen reports, and account events.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => list.setFilters({})}
            className={`btn btn-sm ${!isUnreadFilter ? "btn-primary" : "btn-ghost"}`}
          >
            All
          </button>
          <button
            onClick={() => list.setFilters({ unread: "true" })}
            className={`btn btn-sm ${isUnreadFilter ? "btn-primary" : "btn-ghost"}`}
          >
            Unread
          </button>
          <button onClick={markAll} className="btn btn-sm"><CheckIcon /> Mark all read</button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
          <span className="chip">{list.total >= 0 ? `${list.total.toLocaleString()} item${list.total === 1 ? "" : "s"}` : "Live"}</span>
        </CardHeader>
        <CardBody className="p-0">
          {list.initialLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : list.items.length === 0 ? (
            <EmptyState title="You're all caught up" hint="No notifications match this filter." icon={<BellIcon />} />
          ) : (
            <ul className={`divide-y ${list.loading ? "opacity-70 transition" : "transition"}`} style={{ borderColor: "var(--border)" }}>
              {list.items.map((n) => (
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
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            loading={list.loading}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
          />
        </CardBody>
      </Card>
    </div>
  );
}
