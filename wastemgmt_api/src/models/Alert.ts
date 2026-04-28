import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const AlertSchema = new Schema(
  {
    dustbinId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['BIN_FULL', 'GAS_HIGH', 'TEMP_HIGH', 'OFFLINE', 'CUSTOM'],
      required: true,
      index: true,
    },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning', index: true },
    message: { type: String, required: true },
    metric: { type: String },
    value: { type: Number },
    threshold: { type: Number },
    acknowledged: { type: Boolean, default: false, index: true },
    acknowledgedBy: { type: String },
    acknowledgedAt: { type: Date },
    notifiedEmail: { type: Boolean, default: false },
    tenantId: { type: String, default: 'default', index: true },
  },
  { timestamps: true }
);

AlertSchema.index({ createdAt: -1 });
AlertSchema.index({ tenantId: 1, acknowledged: 1, createdAt: -1 });

export type AlertDoc = HydratedDocument<InferSchemaType<typeof AlertSchema>>;
export const AlertModel = model('Alert', AlertSchema);
