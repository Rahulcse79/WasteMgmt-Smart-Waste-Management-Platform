import { AlertModel, type AlertDoc } from '../models/Alert.js';
import { UserModel } from '../models/User.js';
import { EmailService } from './email.service.js';
import { logger } from '../logger.js';

async function recipientsForDustbin(dustbinId: string): Promise<string[]> {
  // Notify any active user who has this dustbin in their assignedDustbins, plus active admins.
  const users = await UserModel.find({
    isActive: true,
    $or: [{ assignedDustbins: dustbinId }, { role: 'admin' }],
  })
    .select('email')
    .lean();
  return users.map((u) => u.email).filter((e): e is string => !!e && e.length > 0);
}

export class AlertService {
  static async raise(input: {
    dustbinId: string;
    type: AlertDoc['type'];
    severity?: AlertDoc['severity'];
    message: string;
    metric?: string;
    value?: number;
    threshold?: number;
    tenantId?: string;
    notifyEmail?: boolean;
  }): Promise<AlertDoc> {
    const alert = await AlertModel.create({
      dustbinId: input.dustbinId,
      type: input.type,
      severity: input.severity ?? 'warning',
      message: input.message,
      metric: input.metric,
      value: input.value,
      threshold: input.threshold,
      tenantId: input.tenantId ?? 'default',
    });

    if (input.notifyEmail) {
      recipientsForDustbin(input.dustbinId)
        .then((extra) => EmailService.sendAlert(alert, extra))
        .catch((err) =>
          logger.error({ err, alertId: alert.id }, 'Failed to send alert email')
        );
    }
    return alert;
  }

  static async list(filter: { tenantId?: string; acknowledged?: boolean; limit?: number } = {}) {
    const q: Record<string, unknown> = {};
    if (filter.tenantId) q.tenantId = filter.tenantId;
    if (typeof filter.acknowledged === 'boolean') q.acknowledged = filter.acknowledged;
    return AlertModel.find(q)
      .sort({ createdAt: -1 })
      .limit(Math.min(filter.limit ?? 100, 500))
      .lean();
  }

  static async acknowledge(id: string, by: string): Promise<void> {
    await AlertModel.updateOne(
      { _id: id },
      { $set: { acknowledged: true, acknowledgedBy: by, acknowledgedAt: new Date() } }
    );
  }
}
