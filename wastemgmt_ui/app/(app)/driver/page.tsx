"use client";
import { useEffect, useState } from "react";
import { routes, type OptimizedRoute } from "@/lib/api";
import { Card, CardBody, CardHeader, CardTitle, Chip, EmptyState, FillBar, Skeleton } from "@/components/ui/Primitives";
import { TruckIcon, NavigationIcon, RouteIcon } from "@/components/IconsExtended";

const DEFAULT_DEPOT = { lat: 28.6139, lng: 77.2090 }; // New Delhi — works as a sane default.

export default function DriverPage(): React.ReactElement {
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [opts, setOpts] = useState({ lat: DEFAULT_DEPOT.lat, lng: DEFAULT_DEPOT.lng, fillThreshold: 70, limit: 20 });

  // Best-effort browser geolocation — silently falls back if denied.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setOpts((o) => ({ ...o, lat: pos.coords.latitude, lng: pos.coords.longitude })),
        () => undefined,
        { enableHighAccuracy: false, timeout: 5_000 }
      );
    }
  }, []);

  const optimize = async () => {
    const safeLat = Number.isFinite(opts.lat) ? opts.lat : DEFAULT_DEPOT.lat;
    const safeLng = Number.isFinite(opts.lng) ? opts.lng : DEFAULT_DEPOT.lng;
    const safeFill = Math.max(0, Math.min(100, Number.isFinite(opts.fillThreshold) ? opts.fillThreshold : 70));
    const safeLimit = Math.max(1, Math.min(200, Number.isFinite(opts.limit) ? Math.floor(opts.limit) : 20));
    setLoading(true); setErr(null); setDone(new Set());
    try {
      const r = await routes.optimize({
        startLat: safeLat,
        startLng: safeLng,
        fillThreshold: safeFill,
        limit: safeLimit,
      });
      setRoute(r);
    } catch (e) {
      const ex = e as { response?: { data?: { error?: string } } };
      setErr(ex?.response?.data?.error ?? "Failed to compute route");
    } finally {
      setLoading(false);
    }
  };

  const toggleDone = (id: string) => {
    setDone((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const remaining = route ? route.ordered.length - done.size : 0;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="text-grad">Driver</span> route</h1>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>Pickups ordered to minimise distance — tap to mark complete.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Plan a run</CardTitle><span className="chip info"><TruckIcon /> nearest-neighbour + 2-opt</span></CardHeader>
        <CardBody className="grid sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Depot lat</label>
            <input type="number" step="0.000001" className="input mt-1" value={opts.lat}
                   onChange={(e) => setOpts({ ...opts, lat: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Depot lng</label>
            <input type="number" step="0.000001" className="input mt-1" value={opts.lng}
                   onChange={(e) => setOpts({ ...opts, lng: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Fill ≥ (%)</label>
            <input type="number" min={0} max={100} className="input mt-1" value={opts.fillThreshold}
                   onChange={(e) => setOpts({ ...opts, fillThreshold: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Max stops</label>
            <input type="number" min={1} max={200} className="input mt-1" value={opts.limit}
                   onChange={(e) => setOpts({ ...opts, limit: Number(e.target.value) })} />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <button onClick={optimize} disabled={loading} className="btn btn-primary">
              {loading ? "Computing…" : (<><RouteIcon /> Optimise route</>)}
            </button>
          </div>
        </CardBody>
      </Card>

      {err ? <div className="chip danger">{err}</div> : null}

      {loading ? (
        <Card><CardBody className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</CardBody></Card>
      ) : route ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardBody className="text-center">
              <div className="label">Stops</div>
              <div className="text-3xl font-semibold mt-1">{route.ordered.length}</div>
              <div className="text-xs" style={{ color: "var(--fg-muted)" }}>{remaining} left</div>
            </CardBody></Card>
            <Card><CardBody className="text-center">
              <div className="label">Distance</div>
              <div className="text-3xl font-semibold mt-1">{route.totalDistanceKm.toFixed(1)} <span className="text-sm" style={{ color: "var(--fg-muted)" }}>km</span></div>
            </CardBody></Card>
            <Card><CardBody className="text-center">
              <div className="label">ETA</div>
              <div className="text-3xl font-semibold mt-1">{Math.round(route.estimatedMinutes)} <span className="text-sm" style={{ color: "var(--fg-muted)" }}>min</span></div>
            </CardBody></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Stops</CardTitle><span className="chip">{route.unreachable} unreachable</span></CardHeader>
            <CardBody className="p-0">
              {route.ordered.length === 0 ? (
                <EmptyState title="No bins above the threshold" hint="Lower the fill threshold or wait for new readings." icon={<TruckIcon />} />
              ) : (
                <ol className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {route.ordered.map((s, i) => {
                    const checked = done.has(s.dustbinId);
                    const directions = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
                    return (
                      <li key={s.dustbinId} className={`px-5 py-4 flex items-center gap-3 ${checked ? "opacity-50" : ""}`}>
                        <button
                          onClick={() => toggleDone(s.dustbinId)}
                          className={`h-8 w-8 shrink-0 rounded-full grid place-items-center font-bold text-sm transition-all ${
                            checked ? "" : "ring-grad"
                          }`}
                          style={{
                            background: checked ? "var(--success)" : "var(--surface-2)",
                            color: checked ? "#0a0f1f" : "inherit",
                          }}
                          aria-label={checked ? "Mark not done" : "Mark done"}
                        >
                          {checked ? "✓" : i + 1}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className={`font-medium truncate ${checked ? "line-through" : ""}`}>{s.dustbinName}</div>
                          <div className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>{s.dustbinId} · {s.zone} · {s.depth.toFixed(0)}% full</div>
                          <div className="mt-1 w-32"><FillBar value={s.depth} /></div>
                        </div>
                        <a href={directions} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                          <NavigationIcon /> Go
                        </a>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardBody>
          </Card>
        </>
      ) : (
        <Card><CardBody>
          <EmptyState title="No route yet" hint="Set a depot and tap optimise to plan today's pickups." icon={<TruckIcon />} />
        </CardBody></Card>
      )}
    </div>
  );
}
