import { NotificationModel, type NotificationDoc } from '../models/Notification.js';
import { wsHub } from './ws.service.js';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  body?: string;
  severity?: 'info' | 'success' | 'warning' | 'critical';
  category?: 'ALERT' | 'SYSTEM' | 'CITIZEN' | 'ROUTE' | 'ACCOUNT';
  link?: string;
  metadata?: Record<string, unknown>;
  tenantId?: string;
}

export class NotificationService {
  static async create(input: CreateNotificationInput): Promise<NotificationDoc> {
    const doc = await NotificationModel.create(input);
    // Push live to the recipient via the WS hub.
    wsHub.broadcastToUser(input.userId, 'notifications', 'new', {
      _id: doc.id,
      title: doc.title,
      body: doc.body,
      severity: doc.severity,
      category: doc.category,
      link: doc.link,
      createdAt: doc.createdAt,
    });
    return doc;
  }

  static async fanOut(
    userIds: string[],
    payload: Omit<CreateNotificationInput, 'userId'>
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const docs = await NotificationModel.insertMany(
      userIds.map((u) => ({ ...payload, userId: u }))
    );
    for (const d of docs) {
      wsHub.broadcastToUser(d.userId, 'notifications', 'new', {
        _id: d.id,
        title: d.title,
        body: d.body,
        severity: d.severity,
        category: d.category,
        link: d.link,
        createdAt: d.createdAt,
      });
    }
    return docs.length;
  }

  static async list(userId: string, opts: { limit?: number; unreadOnly?: boolean } = {}) {
    const q: Record<string, unknown> = { userId };
    if (opts.unreadOnly) q.read = false;
    return NotificationModel.find(q).sort({ createdAt: -1 }).limit(opts.limit ?? 50).lean();
  }

  static async unreadCount(userId: string): Promise<number> {
    return NotificationModel.countDocuments({ userId, read: false });
  }

  static async markRead(userId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) {
      const r = await NotificationModel.updateMany(
        { userId, read: false },
        { $set: { read: true, readAt: new Date() } }
      );
      return r.modifiedCount;
    }
    const r = await NotificationModel.updateMany(
      { userId, _id: { $in: ids } },
      { $set: { read: true, readAt: new Date() } }
    );
    return r.modifiedCount;
  }
}
