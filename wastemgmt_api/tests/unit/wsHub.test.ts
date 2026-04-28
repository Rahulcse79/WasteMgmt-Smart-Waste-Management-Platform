import { describe, expect, it, vi } from 'vitest';
import { wsHub, type Subscriber } from '../../src/services/ws.service.js';
import type { AuthUser } from '../../src/middleware/auth.js';

interface FakeSocket {
  send: (msg: string) => void;
  sent: string[];
}

function fakeSocket(): FakeSocket {
  const sent: string[] = [];
  return {
    sent,
    send(msg: string) {
      sent.push(msg);
    },
  };
}

function sub(opts: {
  role: 'admin' | 'user';
  username?: string;
  userId?: string;
  topics: string[];
  allowed?: string[];
}): { sub: Subscriber; sock: FakeSocket } {
  const sock = fakeSocket();
  const user: AuthUser = {
    sub: opts.userId ?? `id-${opts.username ?? opts.role}`,
    username: opts.username ?? opts.role,
    role: opts.role,
    type: 'access',
  };
  const s: Subscriber = {
    socket: sock as unknown as Subscriber['socket'],
    user,
    topics: new Set(opts.topics),
    allowedDustbins: opts.allowed ? new Set(opts.allowed) : undefined,
  };
  return { sub: s, sock };
}

describe('WSHub.broadcast — authorisation matrix', () => {
  it('admin with "*" sees every topic', () => {
    const { sub: a, sock } = sub({ role: 'admin', topics: ['*'] });
    wsHub.add(a);
    wsHub.broadcast('dustbin:X', 'reading', { v: 1 });
    wsHub.broadcast('admin:audit', 'log', {});
    wsHub.broadcast('alerts', 'new', {});
    expect(sock.sent).toHaveLength(3);
    wsHub.remove(a);
  });

  it('user without allowedDustbins is denied any dustbin event', () => {
    const { sub: u, sock } = sub({ role: 'user', topics: ['*'] });
    wsHub.add(u);
    wsHub.broadcast('dustbin:X', 'reading', {});
    expect(sock.sent).toHaveLength(0);
    wsHub.remove(u);
  });

  it('user only receives their assigned dustbins', () => {
    const { sub: u, sock } = sub({
      role: 'user',
      topics: ['dustbin:*'],
      allowed: ['BIN-A'],
    });
    wsHub.add(u);
    wsHub.broadcast('dustbin:BIN-A', 'reading', {});
    wsHub.broadcast('dustbin:BIN-B', 'reading', {});
    expect(sock.sent).toHaveLength(1);
    expect(sock.sent[0]).toContain('BIN-A');
    wsHub.remove(u);
  });

  it('user is blocked from admin: namespace', () => {
    const { sub: u, sock } = sub({ role: 'user', topics: ['*'], allowed: ['BIN-A'] });
    wsHub.add(u);
    wsHub.broadcast('admin:audit', 'log', {});
    expect(sock.sent).toHaveLength(0);
    wsHub.remove(u);
  });

  it('topic-pattern wildcard "dustbin:*" matches concrete topics', () => {
    const { sub: a, sock } = sub({ role: 'admin', topics: ['dustbin:*'] });
    wsHub.add(a);
    wsHub.broadcast('dustbin:X', 'reading', {});
    wsHub.broadcast('alerts', 'new', {});
    expect(sock.sent).toHaveLength(1);
    wsHub.remove(a);
  });

  it('exact-topic subscription only matches that topic', () => {
    const { sub: a, sock } = sub({ role: 'admin', topics: ['alerts'] });
    wsHub.add(a);
    wsHub.broadcast('alerts', 'x', {});
    wsHub.broadcast('dustbin:Z', 'x', {});
    expect(sock.sent).toHaveLength(1);
    wsHub.remove(a);
  });

  it('broadcastToUser delivers only to that user, regardless of topics', () => {
    const a = sub({ role: 'admin', userId: 'U1', topics: [] });
    const b = sub({ role: 'admin', userId: 'U2', topics: ['*'] });
    wsHub.add(a.sub);
    wsHub.add(b.sub);
    wsHub.broadcastToUser('U1', 'notifications', 'new', { id: 1 });
    expect(a.sock.sent).toHaveLength(1);
    expect(b.sock.sent).toHaveLength(0);
    wsHub.remove(a.sub);
    wsHub.remove(b.sub);
  });

  it('refreshAssignment updates allowed set in-place', () => {
    const { sub: u, sock } = sub({ role: 'user', userId: 'U7', topics: ['dustbin:*'], allowed: [] });
    wsHub.add(u);
    wsHub.broadcast('dustbin:NEW', 'r', {});
    expect(sock.sent).toHaveLength(0);
    wsHub.refreshAssignment('U7', ['NEW']);
    wsHub.broadcast('dustbin:NEW', 'r', {});
    expect(sock.sent).toHaveLength(1);
    wsHub.remove(u);
  });

  it('continues delivering after a socket throws on send', () => {
    const a = sub({ role: 'admin', topics: ['*'] });
    const b = sub({ role: 'admin', topics: ['*'] });
    a.sock.send = vi.fn(() => {
      throw new Error('boom');
    });
    wsHub.add(a.sub);
    wsHub.add(b.sub);
    expect(() => wsHub.broadcast('alerts', 'x', {})).not.toThrow();
    expect(b.sock.sent).toHaveLength(1);
    wsHub.remove(a.sub);
    wsHub.remove(b.sub);
  });

  it('size() reflects add/remove', () => {
    const before = wsHub.size();
    const a = sub({ role: 'admin', topics: [] });
    wsHub.add(a.sub);
    expect(wsHub.size()).toBe(before + 1);
    wsHub.remove(a.sub);
    expect(wsHub.size()).toBe(before);
  });
});
