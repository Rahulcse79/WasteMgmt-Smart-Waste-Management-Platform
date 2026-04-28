import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * MongoDB time-series collection for high-cardinality sensor data.
 * Use this for analytics, predictions and long-term retention while the
 * Dustbin doc keeps a bounded recent window for fast dashboard reads.
 */
const SensorReadingSchema = new Schema(
  {
    dustbinId: { type: String, required: true },
    metric: { type: String, enum: ['depth', 'gas', 'humidity', 'temperature'], required: true },
    value: { type: Number, required: true },
    timestamp: { type: Date, required: true, default: () => new Date() },
    tenantId: { type: String, default: 'default' },
  },
  {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'dustbinId',
      granularity: 'minutes',
    },
    expireAfterSeconds: 60 * 60 * 24 * 90, // 90-day retention
  }
);

export type SensorReadingDoc = HydratedDocument<InferSchemaType<typeof SensorReadingSchema>>;
export const SensorReadingModel = model('SensorReading', SensorReadingSchema);
