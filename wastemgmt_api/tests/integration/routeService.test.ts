import { describe, expect, it } from 'vitest';
import { RouteService } from '../../src/services/route.service.js';
import { seedDustbins } from '../helpers/factories.js';

describe('RouteService.optimize', () => {
  it('returns empty stops when no bin meets threshold', async () => {
    await seedDustbins([
      { dustbinId: 'A', latitude: 28.6, longitude: 77.2, fill: 10 },
      { dustbinId: 'B', latitude: 28.61, longitude: 77.21, fill: 30 },
    ]);
    const r = await RouteService.optimize({
      depotLat: 28.6,
      depotLng: 77.2,
      fillThreshold: 70,
    });
    expect(r.stops).toEqual([]);
    expect(r.distanceKm).toBe(0);
  });

  it('respects the fill threshold', async () => {
    await seedDustbins([
      { dustbinId: 'A', latitude: 28.6, longitude: 77.2, fill: 95 },
      { dustbinId: 'B', latitude: 28.61, longitude: 77.21, fill: 50 },
      { dustbinId: 'C', latitude: 28.62, longitude: 77.22, fill: 75 },
    ]);
    const r = await RouteService.optimize({
      depotLat: 28.6,
      depotLng: 77.2,
      fillThreshold: 70,
    });
    expect(r.stops.map((s) => s.dustbinId).sort()).toEqual(['A', 'C']);
  });

  it('caps stops to truck limit, keeping highest-fill bins', async () => {
    await seedDustbins([
      { dustbinId: 'A', latitude: 28.6, longitude: 77.2, fill: 80 },
      { dustbinId: 'B', latitude: 28.61, longitude: 77.21, fill: 90 },
      { dustbinId: 'C', latitude: 28.62, longitude: 77.22, fill: 95 },
    ]);
    const r = await RouteService.optimize({
      depotLat: 28.6,
      depotLng: 77.2,
      fillThreshold: 70,
      limit: 2,
    });
    expect(r.stops).toHaveLength(2);
    expect(r.stops.map((s) => s.dustbinId).sort()).toEqual(['B', 'C']);
  });

  it('produces a non-zero distance and ETA when stops exist', async () => {
    await seedDustbins([
      { dustbinId: 'A', latitude: 28.60, longitude: 77.20, fill: 90 },
      { dustbinId: 'B', latitude: 28.62, longitude: 77.22, fill: 90 },
      { dustbinId: 'C', latitude: 28.64, longitude: 77.24, fill: 90 },
    ]);
    const r = await RouteService.optimize({ depotLat: 28.6, depotLng: 77.2 });
    expect(r.stops).toHaveLength(3);
    expect(r.distanceKm).toBeGreaterThan(0);
    expect(r.estDurationMin).toBeGreaterThan(0);
  });

  it('filters by zone when provided', async () => {
    await seedDustbins([
      { dustbinId: 'A', latitude: 28.6, longitude: 77.2, fill: 90, zone: 'North' },
      { dustbinId: 'B', latitude: 28.61, longitude: 77.21, fill: 90, zone: 'South' },
    ]);
    const r = await RouteService.optimize({
      depotLat: 28.6,
      depotLng: 77.2,
      zone: 'North',
    });
    expect(r.stops.map((s) => s.dustbinId)).toEqual(['A']);
  });

  it('orders the stops sensibly (greedy nearest path)', async () => {
    // Clearly-separated cluster; 2-opt should give a near-optimal tour.
    await seedDustbins([
      { dustbinId: 'far', latitude: 28.70, longitude: 77.30, fill: 90 },
      { dustbinId: 'near1', latitude: 28.605, longitude: 77.205, fill: 90 },
      { dustbinId: 'near2', latitude: 28.610, longitude: 77.210, fill: 90 },
    ]);
    const r = await RouteService.optimize({ depotLat: 28.6, depotLng: 77.2 });
    expect(r.stops[0]!.dustbinId).toBe('near1');
    expect(r.stops[1]!.dustbinId).toBe('near2');
    expect(r.stops[2]!.dustbinId).toBe('far');
  });
});
