import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Admin-defined alerting rule. Evaluated by `rules.service` whenever a new
 * sensor reading is ingested. Designed to be safe: only operator + threshold,
 * NOT free-form code execution.
 */
const RuleSchema = new Schema(
  {
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true, index: true },
    metric: { type: String, enum: ['depth', 'gas', 'humidity', 'temperature'], required: true },
    operator: { type: String, enum: ['gt', 'gte', 'lt', 'lte', 'eq'], required: true },
    threshold: { type: Number, required: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    alertType: {
      type: String,
      enum: ['BIN_FULL', 'GAS_HIGH', 'TEMP_HIGH', 'OFFLINE', 'CUSTOM'],
      default: 'CUSTOM',
    },
    notifyEmail: { type: Boolean, default: false },
    cooldownSec: { type: Number, default: 300 },
    appliesToDustbinIds: [{ type: String }], // empty = all
    tenantId: { type: String, default: 'default', index: true },
    lastFiredAt: { type: Map, of: Date, default: {} }, // dustbinId -> last fire time
  },
  { timestamps: true }
);

export type RuleDoc = HydratedDocument<InferSchemaType<typeof RuleSchema>>;
export const RuleModel = model('Rule', RuleSchema);
