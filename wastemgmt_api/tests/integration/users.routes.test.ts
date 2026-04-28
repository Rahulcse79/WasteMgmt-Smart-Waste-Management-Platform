import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginAs } from '../helpers/buildTestApp.js';
import { seedAdminAndUser } from '../helpers/factories.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => app.close());

let creds: Awaited<ReturnType<typeof seedAdminAndUser>>;
beforeEach(async () => {
  creds = await seedAdminAndUser();
});

describe('POST /users (admin only)', () => {
  it('forbids non-admin', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { username: 'newone', password: 'Strong#Pass2026', role: 'user' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('rejects weak passwords with 400', async () => {
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const r = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { username: 'newone', password: 'weak', role: 'user' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects bad usernames (whitespace, symbols)', async () => {
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const r = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { username: 'has space', password: 'Strong#Pass2026', role: 'user' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('creates a valid user', async () => {
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const r = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { username: 'newone', password: 'Strong#Pass2026', role: 'user' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().username).toBe('newone');
  });

  it('rejects duplicate usernames with 409', async () => {
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const payload = { username: 'dupe', password: 'Strong#Pass2026', role: 'user' as const };
    const first = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload,
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload,
    });
    expect(second.statusCode).toBe(409);
  });
});

describe('PATCH /users/:id', () => {
  it('admin can update assignedDustbins', async () => {
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const list = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    const userDoc = list.json().find((u: { username: string }) => u.username === creds.user.username);
    const r = await app.inject({
      method: 'PATCH',
      url: `/users/${userDoc._id}`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { assignedDustbins: ['NEW-BIN-1', 'NEW-BIN-2'] },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().assignedDustbins).toEqual(['NEW-BIN-1', 'NEW-BIN-2']);
  });

  it('non-admin cannot update users', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'PATCH',
      url: `/users/000000000000000000000000`,
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { isActive: false },
    });
    expect(r.statusCode).toBe(403);
  });
});

describe('GET /users (admin only)', () => {
  it('lists users without password hashes', async () => {
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const r = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    const users = r.json();
    expect(Array.isArray(users)).toBe(true);
    for (const u of users) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.refreshTokenHash).toBeUndefined();
    }
  });
});
