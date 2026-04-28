import type { WebSocket } from '@fastify/websocket';
import type { AuthUser } from '../middleware/auth.js';
import { logger } from '../logger.js';

export interface Subscriber {
  socket: WebSocket;
  user: AuthUser;
  topics: Set<string>; // e.g. "dustbin:RGGP-01" or "*"
  /** For non-admin users, the set of dustbin IDs they may receive. Empty Set means none. */
  allowedDustbins?: Set<string>;
}

/**
 * In-memory pub/sub hub for live events. Enforces three tiers of authorization:
 *   1) topic pattern (sub.topics)
 *   2) role gating (admin-only topics)
 *   3) per-user dustbin scoping (a non-admin must be assigned the bin)
 */
class WSHub {
  private subs = new Set<Subscriber>();

  add(sub: Subscriber): void {
    this.subs.add(sub);
    logger.debug({ count: this.subs.size, user: sub.user.username, role: sub.user.role }, 'WS client connected');
  }

  remove(sub: Subscriber): void {
    this.subs.delete(sub);
    logger.debug({ count: this.subs.size }, 'WS client disconnected');
  }

  /** Number of currently-connected clients (used by health/metrics). */
  size(): number {
    return this.subs.size;
  }

  /**
   * Match a subscriber's topic patterns against a concrete topic.
   * Supports prefix wildcards: "dustbin:*" matches "dustbin:ABC".
   */
  private matchesTopic(sub: Subscriber, topic: string): boolean {
    if (sub.topics.has('*')) return true;
    if (sub.topics.has(topic)) return true;
    for (const t of sub.topics) {
      if (t.endsWith(':*') && topic.startsWith(t.slice(0, -1))) return true;
    }
    return false;
  }

  /**
   * Authorise a subscriber to receive `topic`. Enforces:
   *   - admin-only namespaces ("admin:*") rejected for non-admin
   *   - "dustbin:<id>" scoped to assignedDustbins for non-admin
   *   - any other namespace is shared (alerts, notifications:<userId>, …)
   *     (see broadcastToUser for direct-addressed messages)
   */
  private isAuthorized(sub: Subscriber, topic: string): boolean {
    if (sub.user.role === 'admin') return true;
    if (topic.startsWith('admin:')) return false;
    if (topic.startsWith('dustbin:')) {
      const id = topic.slice('dustbin:'.length);
      if (!sub.allowedDustbins) return false; // safe-fail
      return sub.allowedDustbins.has(id);
    }
    return true;
  }

  /** Broadcast event to all subscribers whose topics match AND who are authorized. */
  broadcast(topic: string, event: string, payload: unknown): void {
    const msg = JSON.stringify({ topic, event, payload, ts: Date.now() });
    for (const sub of this.subs) {
      if (!this.matchesTopic(sub, topic)) continue;
      if (!this.isAuthorized(sub, topic)) continue;
      try {
        sub.socket.send(msg);
      } catch (err) {
        logger.warn({ err }, 'WS send failed');
      }
    }
  }

  /** Direct-address a single user (e.g. notification, account events). */
  broadcastToUser(userId: string, topic: string, event: string, payload: unknown): void {
    const msg = JSON.stringify({ topic, event, payload, ts: Date.now() });
    for (const sub of this.subs) {
      if (sub.user.sub !== userId) continue;
      try {
        sub.socket.send(msg);
      } catch (err) {
        logger.warn({ err }, 'WS direct-send failed');
      }
    }
  }

  /**
   * Update the allowed-dustbins set for any sockets owned by this user.
   * Call after admin edits a user's `assignedDustbins` so live sessions
   * pick up new permissions without forcing a reconnect.
   */
  refreshAssignment(userId: string, allowed: string[]): void {
    for (const sub of this.subs) {
      if (sub.user.sub === userId) sub.allowedDustbins = new Set(allowed);
    }
  }
}

export const wsHub = new WSHub();
