import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Per-user in-app notification. Authoritative source for the bell-icon dropdown.
 * Push delivery (web-push / email) is fanned out separately by NotificationService.
 */
const NotificationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', trim: true, maxlength: 1000 },
    severity: {
      type: String,
      enum: ['info', 'success', 'warning', 'critical'],
      default: 'info',
      index: true,
    },
    category: {
      type: String,
      enum: ['ALERT', 'SYSTEM', 'CITIZEN', 'ROUTE', 'ACCOUNT'],
      default: 'SYSTEM',
      index: true,
    },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
    tenantId: { type: String, default: 'default', index: true },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: -1 });

export type NotificationDoc = HydratedDocument<InferSchemaType<typeof NotificationSchema>>;
export const NotificationModel = model('Notification', NotificationSchema);
