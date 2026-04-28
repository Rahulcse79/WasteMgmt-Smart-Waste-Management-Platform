import type { WebSocket } from '@fastify/websocket';
import type { AuthUser } from '../middleware/auth.js';
import { logger } from '../logger.js';

interface Subscriber {
  socket: WebSocket;
  user: AuthUser;
  topics: Set<string>; // e.g. "dustbin:RGGP-01" or "*"
}

class WSHub {
  private subs = new Set<Subscriber>();

  add(sub: Subscriber): void {
    this.subs.add(sub);
    logger.debug({ count: this.subs.size, user: sub.user.username }, 'WS client connected');
  }

  remove(sub: Subscriber): void {
    this.subs.delete(sub);
    logger.debug({ count: this.subs.size }, 'WS client disconnected');
  }

  /** Broadcast event to all subscribers whose topics match. */
  broadcast(topic: string, event: string, payload: unknown): void {
    const msg = JSON.stringify({ topic, event, payload, ts: Date.now() });
    for (const sub of this.subs) {
      if (!sub.topics.has('*') && !sub.topics.has(topic)) continue;
      // Apply role scoping: a 'user' may not see other tenants' raw events.
      if (sub.user.role === 'user' && topic.startsWith('admin:')) continue;
      try {
        sub.socket.send(msg);
      } catch (err) {
        logger.warn({ err }, 'WS send failed');
      }
    }
  }
}

export const wsHub = new WSHub();
