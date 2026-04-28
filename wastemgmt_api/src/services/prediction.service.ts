import { SensorReadingModel } from '../models/SensorReading.js';

/**
 * Lightweight prediction: linear regression on recent depth readings to estimate
 * when the bin will reach 100% fill. Pure, no external ML deps — adequate as a
 * baseline. Swap for an actual ML model later (TF.js, ONNX, server-side Python).
 */
export class PredictionService {
  static async predictBinFullAt(
    dustbinId: string,
    lookbackHours = 24
  ): Promise<{ etaIso: string | null; slopePerHour: number; samples: number }> {
    const since = new Date(Date.now() - lookbackHours * 3600 * 1000);
    const docs = await SensorReadingModel.find({
      dustbinId,
      metric: 'depth',
      timestamp: { $gte: since },
    })
      .sort({ timestamp: 1 })
      .lean();

    if (docs.length < 3) return { etaIso: null, slopePerHour: 0, samples: docs.length };

    // x = hours since first sample, y = depth %
    const t0 = docs[0]!.timestamp.getTime();
    const xs = docs.map((d) => (d.timestamp.getTime() - t0) / 3_600_000);
    const ys = docs.map((d) => d.value);
    const n = xs.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i]!, 0);
    const sumXX = xs.reduce((a, x) => a + x * x, 0);
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return { etaIso: null, slopePerHour: 0, samples: n };
    const slope = (n * sumXY - sumX * sumY) / denom; // % per hour
    const intercept = (sumY - slope * sumX) / n;

    if (slope <= 0) return { etaIso: null, slopePerHour: slope, samples: n };

    const hoursToFull = (100 - intercept) / slope; // hours from t0
    const etaMs = t0 + hoursToFull * 3_600_000;
    if (!Number.isFinite(etaMs) || etaMs < Date.now()) {
      return { etaIso: null, slopePerHour: slope, samples: n };
    }
    return { etaIso: new Date(etaMs).toISOString(), slopePerHour: slope, samples: n };
  }
}
