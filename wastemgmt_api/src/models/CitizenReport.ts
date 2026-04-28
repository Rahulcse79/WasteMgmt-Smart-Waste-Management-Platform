import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Public-submitted report from a citizen (no auth required).
 * Goes through rate-limiting + lightweight moderation queue.
 */
const CitizenReportSchema = new Schema(
  {
    dustbinId: { type: String, default: '', index: true }, // optional — citizen may not know it
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    category: {
      type: String,
      enum: ['OVERFLOW', 'DAMAGE', 'BAD_SMELL', 'MISSING', 'OTHER'],
      default: 'OVERFLOW',
      index: true,
    },
    photoUrl: { type: String, default: '' },
    latitude: { type: Number },
    longitude: { type: Number },
    contactName: { type: String, default: '', trim: true, maxlength: 80 },
    contactEmail: { type: String, default: '', trim: true, lowercase: true, maxlength: 120 },
    contactPhone: { type: String, default: '', trim: true, maxlength: 32 },
    status: {
      type: String,
      enum: ['NEW', 'TRIAGED', 'RESOLVED', 'REJECTED'],
      default: 'NEW',
      index: true,
    },
    handledBy: { type: String, default: '' },
    handledAt: { type: Date },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    tenantId: { type: String, default: 'default', index: true },
  },
  { timestamps: true }
);

CitizenReportSchema.index({ createdAt: -1 });
CitizenReportSchema.index({ status: 1, createdAt: -1 });

export type CitizenReportDoc = HydratedDocument<InferSchemaType<typeof CitizenReportSchema>>;
export const CitizenReportModel = model('CitizenReport', CitizenReportSchema);
