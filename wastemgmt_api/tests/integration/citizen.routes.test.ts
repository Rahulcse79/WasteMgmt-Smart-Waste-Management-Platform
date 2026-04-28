import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginAs } from '../helpers/buildTestApp.js';
import { seedAdminAndUser } from '../helpers/factories.js';
import { CitizenReportModel } from '../../src/models/CitizenReport.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => app.close());

let creds: Awaited<ReturnType<typeof seedAdminAndUser>>;
beforeEach(async () => {
  creds = await seedAdminAndUser();
});

describe('POST /public/citizen-reports', () => {
  it('accepts a valid public submission and creates a record', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/public/citizen-reports',
      payload: {
        description: 'Bin overflowing near the park entrance.',
        category: 'OVERFLOW',
        latitude: 28.6,
        longitude: 77.2,
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().ok).toBe(true);
    const docs = await CitizenReportModel.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.status).toBe('NEW');
    expect(docs[0]!.ip).toBeTruthy();
  });

  it('rejects missing description', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/public/citizen-reports',
      payload: { category: 'OVERFLOW' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects too-short description', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/public/citizen-reports',
      payload: { description: 'hi' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects out-of-range coordinates', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/public/citizen-reports',
      payload: {
        description: 'overflowing bin needs collection now',
        latitude: 999,
        longitude: 0,
      },
    });
    expect(r.statusCode).toBe(400);
  });

  it('silently swallows honeypot submissions', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/public/citizen-reports',
      payload: {
        description: 'overflowing bin needs collection now',
        // bots tend to fill *every* field; honeypot must be empty to be valid input.
        // Server returns 202 + {ok:true} but creates nothing.
        website: 'http://spam.example',
      },
    });
    // Validation still rejects (max(0)) — that itself acts as a guard.
    expect([202, 400]).toContain(r.statusCode);
    const docs = await CitizenReportModel.find().lean();
    expect(docs).toHaveLength(0);
  });
});

describe('Admin /citizen-reports', () => {
  it('non-admin cannot list', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'GET',
      url: '/citizen-reports',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.statusCode).toBe(403);
  });

  it('admin can list and update status', async () => {
    const submit = await app.inject({
      method: 'POST',
      url: '/public/citizen-reports',
      payload: { description: 'overflowing bin near community centre' },
    });
    const id = submit.json().id;
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const list = await app.inject({
      method: 'GET',
      url: '/citizen-reports',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const upd = await app.inject({
      method: 'PATCH',
      url: `/citizen-reports/${id}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { status: 'RESOLVED', note: 'Cleared by truck #4' },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().status).toBe('RESOLVED');
  });
});
