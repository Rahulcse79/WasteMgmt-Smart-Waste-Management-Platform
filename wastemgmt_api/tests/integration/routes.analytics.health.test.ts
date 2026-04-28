import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginAs } from '../helpers/buildTestApp.js';
import { seedAdminAndUser, seedDustbins } from '../helpers/factories.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => app.close());

let creds: Awaited<ReturnType<typeof seedAdminAndUser>>;
beforeEach(async () => {
  creds = await seedAdminAndUser();
});

describe('POST /routes/optimize', () => {
  it('requires authentication', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/routes/optimize',
      payload: { depotLat: 28.6, depotLng: 77.2 },
    });
    expect(r.statusCode).toBe(401);
  });

  it('returns an optimised route for any authenticated user', async () => {
    await seedDustbins([
      { dustbinId: 'A', latitude: 28.61, longitude: 77.21, fill: 90 },
      { dustbinId: 'B', latitude: 28.62, longitude: 77.22, fill: 95 },
    ]);
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'POST',
      url: '/routes/optimize',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { depotLat: 28.6, depotLng: 77.2 },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.stops).toHaveLength(2);
    expect(body.distanceKm).toBeGreaterThan(0);
    expect(body.estDurationMin).toBeGreaterThan(0);
    expect(typeof body.generatedAt).toBe('string');
  });

  it('rejects invalid lat/lng', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'POST',
      url: '/routes/optimize',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { depotLat: 999, depotLng: 0 },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('GET /analytics/dashboard', () => {
  it('requires auth', async () => {
    const r = await app.inject({ method: 'GET', url: '/analytics/dashboard' });
    expect(r.statusCode).toBe(401);
  });

  it('returns a stable shape', async () => {
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const r = await app.inject({
      method: 'GET',
      url: '/analytics/dashboard',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    const k = r.json();
    expect(k.totals).toMatchObject({
      dustbins: expect.any(Number),
      online: expect.any(Number),
      offline: expect.any(Number),
      critical: expect.any(Number),
      avgFill: expect.any(Number),
      openAlerts: expect.any(Number),
      citizenReportsOpen: expect.any(Number),
    });
    expect(Array.isArray(k.fillBuckets)).toBe(true);
    expect(Array.isArray(k.zones)).toBe(true);
  });
});

describe('GET /health', () => {
  it('returns 200 + ok with db up', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe('ok');
    expect(r.json().db).toBe('up');
  });

  it('readiness endpoint returns 200 when connected', async () => {
    const r = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(r.statusCode).toBe(200);
    expect(r.json().ready).toBe(true);
  });
});
