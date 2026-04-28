import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Dustbin document. Sensor histories are kept as bounded arrays for fast reads of
 * recent values (matches the reference API in details.txt).
 *
 * For long-term archival / true time-series at 30k+ device scale, see
 * `SensorReading` (a separate MongoDB time-series collection).
 */
const ReadingSchema = new Schema(
  {
    value: { type: Number, required: true },
    timestamp: { type: Date, required: true, default: () => new Date() },
  },
  { _id: true }
);

const DustbinSchema = new Schema(
  {
    dustbinId: { type: String, required: true, unique: true, index: true, trim: true },
    dustbinName: { type: String, required: true, trim: true },
    tenantId: { type: String, default: 'default', index: true }, // multi-tenant
    zone: { type: String, default: '', index: true },

    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },

    // Recent rolling windows (bounded to keep document size sane)
    depth: { type: [ReadingSchema], default: [] },
    gas: { type: [ReadingSchema], default: [] },
    humidity: { type: [ReadingSchema], default: [] },
    temperature: { type: [ReadingSchema], default: [] },

    // Heartbeat / health
    lastSeenAt: { type: Date, index: true },
    online: { type: Boolean, default: false, index: true },

    // Cached aggregates for dashboard (avoid recomputing across 30k docs)
    latest: {
      depth: { type: Number },
      gas: { type: Number },
      humidity: { type: Number },
      temperature: { type: Number },
      timestamp: { type: Date },
    },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Geospatial index for map / proximity queries
DustbinSchema.index({ latitude: 1, longitude: 1 });
DustbinSchema.index({ tenantId: 1, zone: 1 });

export type DustbinDoc = HydratedDocument<InferSchemaType<typeof DustbinSchema>>;
export const DustbinModel = model('Dustbin', DustbinSchema);

export const READING_WINDOW = 200; // keep last N points per metric in the doc
