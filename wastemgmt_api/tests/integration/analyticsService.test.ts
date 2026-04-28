import { describe, expect, it } from 'vitest';
import { AnalyticsService } from '../../src/services/analytics.service.js';
import { DustbinModel } from '../../src/models/Dustbin.js';
import { AlertModel } from '../../src/models/Alert.js';
import { CitizenReportModel } from '../../src/models/CitizenReport.js';
import { seedDustbins } from '../helpers/factories.js';

describe('AnalyticsService.dashboard', () => {
  it('returns zeros for an empty database', async () => {
    const k = await AnalyticsService.dashboard();
    expect(k.totals.dustbins).toBe(0);
    expect(k.totals.openAlerts).toBe(0);
    expect(k.zones).toEqual([]);
    expect(k.fillBuckets.reduce((a, b) => a + b.count, 0)).toBe(0);
  });

  it('aggregates fill buckets and severity counts correctly', async () => {
    await seedDustbins([
      { dustbinId: '1', latitude: 0, longitude: 0, fill: 10, zone: 'A' },
      { dustbinId: '2', latitude: 0, longitude: 0, fill: 40, zone: 'A' },
      { dustbinId: '3', latitude: 0, longitude: 0, fill: 60, zone: 'B' },
      { dustbinId: '4', latitude: 0, longitude: 0, fill: 85, zone: 'B' },
      { dustbinId: '5', latitude: 0, longitude: 0, fill: 95, zone: 'B' },
    ]);
    const k = await AnalyticsService.dashboard();
    expect(k.totals.dustbins).toBe(5);
    expect(k.totals.healthy).toBe(2);
    expect(k.totals.warning).toBe(1);
    expect(k.totals.critical).toBe(2);
    expect(k.totals.avgFill).toBeCloseTo((10 + 40 + 60 + 85 + 95) / 5, 1);

    const map = Object.fromEntries(k.fillBuckets.map((b) => [b.bucket, b.count]));
    expect(map['0-25']).toBe(1);
    expect(map['25-50']).toBe(1);
    expect(map['50-75']).toBe(1);
    expect(map['75-90']).toBe(1);
    expect(map['90-100']).toBe(1);
  });

  it('returns top-10 fullest bins, sorted desc', async () => {
    await seedDustbins(
      Array.from({ length: 12 }, (_, i) => ({
        dustbinId: `D${i}`,
        latitude: 0,
        longitude: 0,
        fill: i * 8, // 0,8,…,88
      }))
    );
    const k = await AnalyticsService.dashboard();
    expect(k.topFull).toHaveLength(10);
    expect(k.topFull[0]!.fill).toBeGreaterThanOrEqual(k.topFull[9]!.fill);
  });

  it('counts open alerts and citizen reports', async () => {
    await AlertModel.insertMany([
      { dustbinId: 'X', type: 'BIN_FULL', message: 'a', acknowledged: false },
      { dustbinId: 'X', type: 'BIN_FULL', message: 'b', acknowledged: true },
    ]);
    await CitizenReportModel.insertMany([
      { description: 'overflowing bin near park', status: 'NEW' },
      { description: 'broken lid on the bin', status: 'RESOLVED' },
    ]);
    const k = await AnalyticsService.dashboard();
    expect(k.totals.openAlerts).toBe(1);
    expect(k.totals.citizenReportsOpen).toBe(1);
  });

  it('groups by zone and sorts critical-first', async () => {
    await seedDustbins([
      { dustbinId: '1', latitude: 0, longitude: 0, fill: 90, zone: 'X' },
      { dustbinId: '2', latitude: 0, longitude: 0, fill: 95, zone: 'X' },
      { dustbinId: '3', latitude: 0, longitude: 0, fill: 30, zone: 'Y' },
    ]);
    const k = await AnalyticsService.dashboard();
    expect(k.zones[0]!.zone).toBe('X');
    expect(k.zones[0]!.critical).toBe(2);
  });

  it('fillTrend filters by hours window', async () => {
    const now = Date.now();
    await DustbinModel.create({
      dustbinId: 'trend',
      dustbinName: 'trend',
      latitude: 0,
      longitude: 0,
      depth: [
        { value: 10, timestamp: new Date(now - 48 * 3600_000) }, // outside
        { value: 50, timestamp: new Date(now - 1 * 3600_000) }, // inside
        { value: 80, timestamp: new Date(now - 30 * 60_000) }, // inside
      ],
    });
    const trend = await AnalyticsService.fillTrend('trend', 24);
    expect(trend).toHaveLength(2);
    expect(trend.map((p) => p.value)).toEqual([50, 80]);
  });
});
