import { AuditLogModel } from '../models/AuditLog.js';
import type { AuthUser } from '../middleware/auth.js';

export class AuditService {
  static async log(input: {
    actor?: AuthUser;
    action: string;
    resource: string;
    resourceId?: string;
    method?: string;
    path?: string;
    ip?: string;
    userAgent?: string;
    statusCode?: number;
    diff?: unknown;
    metadata?: unknown;
  }): Promise<void> {
    await AuditLogModel.create({
      actorId: input.actor?.sub,
      actorUsername: input.actor?.username,
      actorRole: input.actor?.role,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      method: input.method,
      path: input.path,
      ip: input.ip,
      userAgent: input.userAgent,
      statusCode: input.statusCode,
      diff: input.diff,
      metadata: input.metadata,
    });
  }
}
