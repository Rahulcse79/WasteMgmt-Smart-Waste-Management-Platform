import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, loginAs } from '../helpers/buildTestApp.js';
import { seedAdminAndUser } from '../helpers/factories.js';
import { NotificationService } from '../../src/services/notification.service.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => app.close());

let creds: Awaited<ReturnType<typeof seedAdminAndUser>>;
beforeEach(async () => {
  creds = await seedAdminAndUser();
});

async function userId(username: string): Promise<string> {
  const a = await loginAs(app, creds.admin.username, creds.admin.password);
  const r = await app.inject({
    method: 'GET',
    url: '/users',
    headers: { authorization: `Bearer ${a.accessToken}` },
  });
  return r.json().find((u: { username: string }) => u.username === username)._id;
}

describe('Notifications', () => {
  it('returns empty list for new account', async () => {
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
  });

  it('lists newest-first and counts unread', async () => {
    const uid = await userId(creds.user.username);
    await NotificationService.create({ userId: uid, title: 'first' });
    await new Promise((r) => setTimeout(r, 5));
    await NotificationService.create({ userId: uid, title: 'second' });
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const list = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    const arr = list.json();
    expect(arr).toHaveLength(2);
    expect(arr[0].title).toBe('second');

    const cnt = await app.inject({
      method: 'GET',
      url: '/notifications/unread-count',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(cnt.json().count).toBe(2);
  });

  it('mark-read with empty ids marks all as read', async () => {
    const uid = await userId(creds.user.username);
    await NotificationService.create({ userId: uid, title: 'a' });
    await NotificationService.create({ userId: uid, title: 'b' });
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'POST',
      url: '/notifications/mark-read',
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { ids: [] },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().modified).toBe(2);
    const cnt = await app.inject({
      method: 'GET',
      url: '/notifications/unread-count',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(cnt.json().count).toBe(0);
  });

  it('a user cannot read another user’s notifications', async () => {
    const adminId = await userId(creds.admin.username);
    await NotificationService.create({ userId: adminId, title: 'admin-only' });
    const a = await loginAs(app, creds.user.username, creds.user.password);
    const r = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
  });
});
