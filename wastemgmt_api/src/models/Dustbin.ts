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
    // GeoJSON shadow of (longitude, latitude) so we can use $near / $geoWithin.
    // Maintained by the upsert pre-save hook below; never set this directly.
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },

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

// Geospatial indexes
// 2dsphere on the GeoJSON `location` powers $near / $geoWithin / radius queries.
// The legacy {latitude:1, longitude:1} compound index stays for cheap bbox scans
// from the existing dashboard code.
DustbinSchema.index({ location: '2dsphere' });
DustbinSchema.index({ latitude: 1, longitude: 1 });
DustbinSchema.index({ tenantId: 1, zone: 1 });
// Covers the admin paginated list (filter on isActive[+zone/online], sort on dustbinId).
DustbinSchema.index({ isActive: 1, dustbinId: 1 });
DustbinSchema.index({ isActive: 1, online: 1, dustbinId: 1 });

// Keep the GeoJSON shadow in sync with latitude/longitude on every write.
// Doing it here means callers (DustbinService.upsert, route PUT) don't need
// to know the GeoJSON shape exists.
DustbinSchema.pre('save', function syncLocation(next) {
  if (this.isModified('latitude') || this.isModified('longitude') || this.isNew) {
    this.set('location', { type: 'Point', coordinates: [this.longitude, this.latitude] });
  }
  next();
});

DustbinSchema.pre('findOneAndUpdate', function syncLocationOnUpdate(next) {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update) return next();
  const $set = (update.$set as Record<string, unknown> | undefined) ?? update;
  const lat = $set.latitude as number | undefined;
  const lng = $set.longitude as number | undefined;
  if (typeof lat === 'number' || typeof lng === 'number') {
    // We only have one side of the pair in the update. Pull the other from
    // the document so we never end up with a half-updated GeoJSON point.
    void this.model
      .findOne(this.getQuery())
      .select('latitude longitude')
      .lean()
      .then((existing) => {
        const existingDoc = (Array.isArray(existing) ? existing[0] : existing) as
          | { latitude?: number; longitude?: number }
          | null;
        const finalLat = typeof lat === 'number' ? lat : existingDoc?.latitude;
        const finalLng = typeof lng === 'number' ? lng : existingDoc?.longitude;
        if (typeof finalLat === 'number' && typeof finalLng === 'number') {
          if (update.$set) {
            (update.$set as Record<string, unknown>).location = {
              type: 'Point',
              coordinates: [finalLng, finalLat],
            };
          } else {
            update.location = { type: 'Point', coordinates: [finalLng, finalLat] };
          }
          this.setUpdate(update);
        }
        next();
      })
      .catch(next);
    return;
  }
  next();
});

export type DustbinDoc = HydratedDocument<InferSchemaType<typeof DustbinSchema>>;
export const DustbinModel = model('Dustbin', DustbinSchema);

export const READING_WINDOW = 200; // keep last N points per metric in the doc
