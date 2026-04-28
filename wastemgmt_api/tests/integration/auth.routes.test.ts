import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginAs } from '../helpers/buildTestApp.js';
import { seedAdminAndUser } from '../helpers/factories.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});

let creds: Awaited<ReturnType<typeof seedAdminAndUser>>;
beforeEach(async () => {
  creds = await seedAdminAndUser();
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: creds.admin.username, password: creds.admin.password },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.role).toBe('admin');
  });

  it('rejects wrong password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: creds.admin.username, password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown username with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'nobody', password: 'whatever' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects request missing both username and payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('treats username as case-insensitive', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: creds.admin.username.toUpperCase(), password: creds.admin.password },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns no Set-Cookie header (token is in body)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: creds.user.username, password: creds.user.password },
    });
    expect(res.statusCode).toBe(200);
    // Either no Set-Cookie at all, or only a non-auth cookie (none expected today).
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /auth/refresh', () => {
  it('issues a new pair and rotates the refresh token', async () => {
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const r = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: a.refreshToken },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(a.refreshToken); // rotated

    // The OLD token must now be revoked (one-shot rotation).
    const stale = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: a.refreshToken },
    });
    expect(stale.statusCode).toBe(401);
  });

  it('rejects an invalid refresh token', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'not.a.real.jwt.value' },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('POST /auth/logout + GET /auth/me', () => {
  it('logout invalidates the stored refresh token', async () => {
    const a = await loginAs(app, creds.admin.username, creds.admin.password);
    const out = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(out.statusCode).toBe(200);
    // The previously-issued refresh token must no longer match.
    const r = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: a.refreshToken },
    });
    expect(r.statusCode).toBe(401);
  });

  it('GET /auth/me requires Authorization header', async () => {
    const r = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(r.statusCode).toBe(401);
  });

  it('GET /auth/me returns the current user', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.user.username).toBe(creds.user.username);
    expect(body.user.passwordHash).toBeUndefined();
  });
});

describe('Self-service password change', () => {
  it('rejects when current password is wrong', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'POST',
      url: '/auth/me/password',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { currentPassword: 'wrong', newPassword: 'NewPass#2026X' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects weak new passwords (policy enforced)', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'POST',
      url: '/auth/me/password',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { currentPassword: creds.user.password, newPassword: 'short1' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('accepts a strong new password and revokes refresh tokens', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'POST',
      url: '/auth/me/password',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { currentPassword: creds.user.password, newPassword: 'BrandNew#2026' },
    });
    expect(r.statusCode).toBe(200);
    // Old refresh must be unusable; new login must succeed.
    const stale = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: a.refreshToken },
    });
    expect(stale.statusCode).toBe(401);
    const fresh = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: creds.user.username, password: 'BrandNew#2026' },
    });
    expect(fresh.statusCode).toBe(200);
  });
});

describe('Email update on /auth/me', () => {
  it('updates the user’s email', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { email: 'me@example.com' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().email).toBe('me@example.com');
  });

  it('rejects an invalid email format', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { email: 'not-an-email' },
    });
    expect(r.statusCode).toBe(400);
  });
});
