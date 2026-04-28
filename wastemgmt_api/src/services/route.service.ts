/**
 * Collection-truck route optimisation.
 *
 * Strategy (real-world but pragmatic):
 *   1) Filter candidates by fill threshold (default ≥ 70%) or staleness.
 *   2) Solve nearest-neighbour TSP from the depot, then 2-opt refine.
 *
 * Distance: equirectangular approximation in km — accurate enough for city
 * routes (< 50 km) and ~100x faster than Haversine.
 */
import { DustbinModel } from '../models/Dustbin.js';

export interface RoutePoint {
  dustbinId: string;
  dustbinName: string;
  latitude: number;
  longitude: number;
  fill: number;
  zone?: string;
}

export interface OptimizedRoute {
  depot: { latitude: number; longitude: number };
  stops: RoutePoint[];
  distanceKm: number;
  estDurationMin: number;
  generatedAt: string;
}

const EARTH_R = 6371;

function distKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const latMid = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const dx = (b.longitude - a.longitude) * (Math.PI / 180) * Math.cos(latMid);
  const dy = (b.latitude - a.latitude) * (Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy) * EARTH_R;
}

function totalDistance(depot: { latitude: number; longitude: number }, stops: RoutePoint[]): number {
  if (stops.length === 0) return 0;
  let d = distKm(depot, stops[0]!);
  for (let i = 1; i < stops.length; i++) d += distKm(stops[i - 1]!, stops[i]!);
  d += distKm(stops[stops.length - 1]!, depot);
  return d;
}

function nearestNeighbour(depot: { latitude: number; longitude: number }, points: RoutePoint[]): RoutePoint[] {
  const remaining = [...points];
  const route: RoutePoint[] = [];
  let cur: { latitude: number; longitude: number } = depot;
  while (remaining.length > 0) {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const d = distKm(cur, remaining[i]!);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const next = remaining.splice(best, 1)[0]!;
    route.push(next);
    cur = next;
  }
  return route;
}

function twoOpt(
  depot: { latitude: number; longitude: number },
  route: RoutePoint[],
  maxIterations = 50
): RoutePoint[] {
  if (route.length < 4) return route;
  let best = [...route];
  let bestDist = totalDistance(depot, best);
  for (let it = 0; it < maxIterations; it++) {
    let improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const d = totalDistance(depot, candidate);
        if (d + 1e-9 < bestDist) {
          best = candidate;
          bestDist = d;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

export interface OptimizeOptions {
  depotLat: number;
  depotLng: number;
  fillThreshold?: number; // 0–100, default 70
  zone?: string;
  limit?: number; // max stops (truck capacity), default 25
  avgKmh?: number; // cruising speed used for ETA, default 25
  serviceMinPerStop?: number; // service time per stop, default 4
}

export class RouteService {
  static async optimize(opts: OptimizeOptions): Promise<OptimizedRoute> {
    const fillThreshold = opts.fillThreshold ?? 70;
    const limit = Math.max(1, Math.min(200, opts.limit ?? 25));
    const avgKmh = opts.avgKmh ?? 25;
    const serviceMin = opts.serviceMinPerStop ?? 4;

    const query: Record<string, unknown> = {
      isActive: true,
      'latest.depth': { $gte: fillThreshold },
    };
    if (opts.zone) query.zone = opts.zone;

    const docs = await DustbinModel.find(query)
      .select('dustbinId dustbinName latitude longitude zone latest')
      .lean();

    const depot = { latitude: opts.depotLat, longitude: opts.depotLng };
    const candidates: RoutePoint[] = docs.map((d) => ({
      dustbinId: d.dustbinId,
      dustbinName: d.dustbinName,
      latitude: d.latitude,
      longitude: d.longitude,
      fill: Number(d.latest?.depth ?? 0),
      zone: d.zone ?? '',
    }));

    // Greedy capacity cap: keep highest-fill bins first.
    candidates.sort((a, b) => b.fill - a.fill);
    const capped = candidates.slice(0, limit);

    const seed = nearestNeighbour(depot, capped);
    const refined = twoOpt(depot, seed);
    const distanceKm = totalDistance(depot, refined);
    const estDurationMin = (distanceKm / avgKmh) * 60 + refined.length * serviceMin;

    return {
      depot,
      stops: refined,
      distanceKm: Math.round(distanceKm * 100) / 100,
      estDurationMin: Math.round(estDurationMin),
      generatedAt: new Date().toISOString(),
    };
  }
}
