"use client";
import { useState } from "react";
import { routes, type OptimizedRoute } from "@/lib/api";
import { Card, CardBody, CardHeader, CardTitle, Chip, EmptyState, FillBar, Skeleton } from "@/components/ui/Primitives";
import { RouteIcon, NavigationIcon } from "@/components/IconsExtended";

export default function AdminRoutesPage(): React.ReactElement {
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [opts, setOpts] = useState({
    startLat: 28.6139, startLng: 77.2090,
    fillThreshold: 70, limit: 25, zone: "", avgKmh: 25, serviceMinPerStop: 4,
  });

  const optimise = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await routes.optimize({
        startLat: opts.startLat, startLng: opts.startLng,
        fillThreshold: opts.fillThreshold, limit: opts.limit,
        zone: opts.zone || undefined, avgKmh: opts.avgKmh, serviceMinPerStop: opts.serviceMinPerStop,
      });
      setRoute(r);
    } catch (e) {
      const ex = e as { response?: { data?: { error?: string } } };
      setErr(ex?.response?.data?.error ?? "Failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight"><span className="text-grad">Route planner</span></h1>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>Compute the shortest pickup loop for trucks.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Parameters</CardTitle><Chip tone="info"><RouteIcon /> 2-opt</Chip></CardHeader>
        <CardBody className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {([
            ["Start lat", "startLat", "number"], ["Start lng", "startLng", "number"],
            ["Fill ≥ %", "fillThreshold", "number"], ["Max stops", "limit", "number"],
            ["Avg km/h", "avgKmh", "number"], ["Service min/stop", "serviceMinPerStop", "number"],
          ] as const).map(([label, key, type]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input type={type} step="any" className="input mt-1" value={opts[key as keyof typeof opts] as number}
                     onChange={(e) => setOpts({ ...opts, [key]: Number(e.target.value) })} />
            </div>
          ))}
          <div className="sm:col-span-3">
            <label className="label">Zone (optional)</label>
            <input className="input mt-1" value={opts.zone} onChange={(e) => setOpts({ ...opts, zone: e.target.value })}
                   placeholder="e.g. North-A" />
          </div>
          <div className="sm:col-span-3 flex items-end justify-end">
            <button onClick={optimise} disabled={loading} className="btn btn-primary">
              {loading ? "Computing…" : "Optimise"}
            </button>
          </div>
        </CardBody>
      </Card>

      {err ? <div className="chip danger">{err}</div> : null}

      {loading ? (
        <Card><CardBody><Skeleton className="h-40 w-full" /></CardBody></Card>
      ) : route ? (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Card><CardBody className="text-center"><div className="label">Stops</div><div className="text-3xl font-semibold">{route.ordered.length}</div></CardBody></Card>
            <Card><CardBody className="text-center"><div className="label">Distance</div><div className="text-3xl font-semibold">{route.totalDistanceKm.toFixed(1)} km</div></CardBody></Card>
            <Card><CardBody className="text-center"><div className="label">ETA</div><div className="text-3xl font-semibold">{Math.round(route.estimatedMinutes)} min</div></CardBody></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Ordered stops</CardTitle></CardHeader>
            <CardBody className="p-0">
              {route.ordered.length === 0 ? (
                <EmptyState title="No bins meet the criteria" icon={<RouteIcon />} />
              ) : (
                <ol className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {route.ordered.map((s, i) => (
                    <li key={s.dustbinId} className="px-5 py-3 flex items-center gap-3">
                      <span className="h-7 w-7 grid place-items-center rounded-full font-bold text-xs" style={{ background: "var(--surface-2)" }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{s.dustbinName}</div>
                        <div className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>{s.dustbinId} · {s.zone} · {s.depth.toFixed(0)}%</div>
                      </div>
                      <div className="w-32"><FillBar value={s.depth} /></div>
                      <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                        <NavigationIcon />
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}
