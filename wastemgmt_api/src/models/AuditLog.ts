import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const AuditLogSchema = new Schema(
  {
    actorId: { type: String, index: true },
    actorUsername: { type: String, index: true },
    actorRole: { type: String },
    action: { type: String, required: true, index: true }, // e.g. USER_CREATE, DUSTBIN_UPDATE
    resource: { type: String, required: true, index: true }, // e.g. user, dustbin, config
    resourceId: { type: String },
    method: { type: String },
    path: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    statusCode: { type: Number },
    diff: { type: Schema.Types.Mixed }, // before / after snapshot
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });

export type AuditLogDoc = HydratedDocument<InferSchemaType<typeof AuditLogSchema>>;
export const AuditLogModel = model('AuditLog', AuditLogSchema);
