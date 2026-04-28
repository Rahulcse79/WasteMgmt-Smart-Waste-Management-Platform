import { DustbinModel, READING_WINDOW, type DustbinDoc } from '../models/Dustbin.js';
import { SensorReadingModel } from '../models/SensorReading.js';

export type Metric = 'depth' | 'gas' | 'humidity' | 'temperature';

export class DustbinService {
  static async list(filter: { tenantId?: string; assignedIds?: string[] } = {}): Promise<DustbinDoc[]> {
    const q: Record<string, unknown> = { isActive: true };
    if (filter.tenantId) q.tenantId = filter.tenantId;
    if (filter.assignedIds && filter.assignedIds.length > 0) q.dustbinId = { $in: filter.assignedIds };
    return DustbinModel.find(q).sort({ dustbinId: 1 }).lean<DustbinDoc[]>();
  }

  static async getById(dustbinId: string): Promise<DustbinDoc | null> {
    return DustbinModel.findOne({ dustbinId, isActive: true }).lean<DustbinDoc | null>();
  }

  static async upsert(input: {
    dustbinId: string;
    dustbinName: string;
    latitude: number;
    longitude: number;
    tenantId?: string;
    zone?: string;
  }): Promise<DustbinDoc> {
    const doc = await DustbinModel.findOneAndUpdate(
      { dustbinId: input.dustbinId },
      {
        $set: {
          dustbinName: input.dustbinName,
          latitude: input.latitude,
          longitude: input.longitude,
          tenantId: input.tenantId ?? 'default',
          zone: input.zone ?? '',
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return doc as DustbinDoc;
  }

  static async softDelete(dustbinId: string): Promise<void> {
    await DustbinModel.updateOne({ dustbinId }, { $set: { isActive: false } });
  }

  /**
   * Append a sensor reading: writes to the time-series collection AND updates
   * the bounded rolling window on the Dustbin doc. This is the hot path for
   * MQTT ingestion — keep it cheap.
   */
  static async appendReading(input: {
    dustbinId: string;
    metric: Metric;
    value: number;
    timestamp: Date;
    tenantId?: string;
  }): Promise<void> {
    const { dustbinId, metric, value, timestamp, tenantId } = input;

    // 1. time-series archive (fire-and-forget — but we await to surface errors in dev)
    await SensorReadingModel.create({
      dustbinId,
      metric,
      value,
      timestamp,
      tenantId: tenantId ?? 'default',
    });

    // 2. rolling window + cached latest
    await DustbinModel.updateOne(
      { dustbinId },
      {
        $push: {
          [metric]: { $each: [{ value, timestamp }], $slice: -READING_WINDOW },
        },
        $set: {
          [`latest.${metric}`]: value,
          'latest.timestamp': timestamp,
          lastSeenAt: new Date(),
          online: true,
        },
      }
    );
  }

  /** Bulk-update the cached `latest` from many metric readings in one ingest. */
  static async ingestBulkReadings(input: {
    dustbinId: string;
    timestamp: Date;
    readings: Partial<Record<Metric, number>>;
    tenantId?: string;
  }): Promise<void> {
    const { dustbinId, timestamp, readings, tenantId } = input;
    const ops = Object.entries(readings).map(([metric, value]) =>
      this.appendReading({ dustbinId, metric: metric as Metric, value: value as number, timestamp, tenantId })
    );
    await Promise.all(ops);
  }
}
