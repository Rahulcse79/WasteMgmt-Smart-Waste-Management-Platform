import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginAs } from '../helpers/buildTestApp.js';
import { seedAdminAndUser, seedDustbins } from '../helpers/factories.js';
import { AlertModel } from '../../src/models/Alert.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => app.close());

let creds: Awaited<ReturnType<typeof seedAdminAndUser>>;
beforeEach(async () => {
  creds = await seedAdminAndUser();
});

describe('CSV exports', () => {
  it('forbids non-admin', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'GET',
      url: '/export/dustbins.csv',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.statusCode).toBe(403);
  });

  it('returns a CSV with headers and rows for dustbins', async () => {
    await seedDustbins([
      { dustbinId: 'BIN-X', latitude: 28.6, longitude: 77.2, fill: 70, zone: 'Z1' },
    ]);
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const r = await app.inject({
      method: 'GET',
      url: '/export/dustbins.csv',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toContain('dustbins.csv');
    expect(r.body.split('\r\n')[0]).toBe(
      'dustbinId,dustbinName,zone,latitude,longitude,online,lastSeenAt,depth,gas,humidity,temperature'
    );
    expect(r.body).toContain('BIN-X');
  });

  it('escapes commas, quotes and newlines', async () => {
    await AlertModel.create({
      dustbinId: 'X',
      type: 'CUSTOM',
      message: 'comma, "quote" and\nnewline',
      acknowledged: false,
    });
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const r = await app.inject({
      method: 'GET',
      url: '/export/alerts.csv',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('"comma, ""quote"" and\nnewline"');
  });

  it('respects from/to date filters on alerts', async () => {
    const old = new Date('2024-01-01T00:00:00Z');
    const recent = new Date();
    await AlertModel.collection.insertMany([
      { dustbinId: 'X', type: 'BIN_FULL', message: 'ANCIENT_MARK', acknowledged: false, createdAt: old, updatedAt: old },
      { dustbinId: 'X', type: 'BIN_FULL', message: 'FRESH_MARK', acknowledged: false, createdAt: recent, updatedAt: recent },
    ]);
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const r = await app.inject({
      method: 'GET',
      url: `/export/alerts.csv?from=${new Date(Date.now() - 60_000).toISOString()}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.body).toContain('FRESH_MARK');
    expect(r.body).not.toContain('ANCIENT_MARK');
  });
});
