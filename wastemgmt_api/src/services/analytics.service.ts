import { DustbinModel } from '../models/Dustbin.js';
import { AlertModel } from '../models/Alert.js';
import { CitizenReportModel } from '../models/CitizenReport.js';

export interface DashboardKpis {
  totals: {
    dustbins: number;
    online: number;
    offline: number;
    critical: number; // fill ≥ 80
    warning: number; // 50 ≤ fill < 80
    healthy: number; // fill < 50
    avgFill: number;
    openAlerts: number;
    citizenReportsOpen: number;
  };
  fillBuckets: Array<{ bucket: string; count: number }>;
  topFull: Array<{ dustbinId: string; dustbinName: string; fill: number; zone?: string }>;
  zones: Array<{ zone: string; count: number; avgFill: number; critical: number }>;
  recentAlerts: number;
  collectedToday?: number;
}

export class AnalyticsService {
  /**
   * @param tenantId  Caller's tenant. Always pass the authenticated user's tenant —
   *                  the default exists only for tests / single-tenant deployments.
   */
  static async dashboard(tenantId = 'default'): Promise<DashboardKpis> {
    const [dustbins, openAlerts, recentAlerts, citizenOpen] = await Promise.all([
      DustbinModel.find({ tenantId, isActive: true })
        .select('dustbinId dustbinName zone online latest')
        .lean(),
      AlertModel.countDocuments({ tenantId, acknowledged: false }),
      AlertModel.countDocuments({
        tenantId,
        createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      }),
      CitizenReportModel.countDocuments({ tenantId, status: { $in: ['NEW', 'TRIAGED'] } }),
    ]);

    const buckets = { '0-25': 0, '25-50': 0, '50-75': 0, '75-90': 0, '90-100': 0 };
    let critical = 0;
    let warning = 0;
    let healthy = 0;
    let online = 0;
    let fillSum = 0;
    let fillN = 0;

    const zoneAgg = new Map<string, { count: number; sum: number; critical: number }>();
    const topFullArr: Array<{ dustbinId: string; dustbinName: string; fill: number; zone?: string }> = [];

    for (const d of dustbins) {
      if (d.online) online++;
      const fill = Number(d.latest?.depth ?? NaN);
      if (Number.isFinite(fill)) {
        fillSum += fill;
        fillN++;
        if (fill >= 80) critical++;
        else if (fill >= 50) warning++;
        else healthy++;
        if (fill < 25) buckets['0-25']++;
        else if (fill < 50) buckets['25-50']++;
        else if (fill < 75) buckets['50-75']++;
        else if (fill < 90) buckets['75-90']++;
        else buckets['90-100']++;
        topFullArr.push({
          dustbinId: d.dustbinId,
          dustbinName: d.dustbinName,
          fill,
          zone: d.zone ?? '',
        });
      }
      const z = d.zone || 'Unzoned';
      const cur = zoneAgg.get(z) ?? { count: 0, sum: 0, critical: 0 };
      cur.count += 1;
      if (Number.isFinite(fill)) {
        cur.sum += fill;
        if (fill >= 80) cur.critical += 1;
      }
      zoneAgg.set(z, cur);
    }

    topFullArr.sort((a, b) => b.fill - a.fill);

    return {
      totals: {
        dustbins: dustbins.length,
        online,
        offline: dustbins.length - online,
        critical,
        warning,
        healthy,
        avgFill: fillN ? Math.round((fillSum / fillN) * 10) / 10 : 0,
        openAlerts,
        citizenReportsOpen: citizenOpen,
      },
      fillBuckets: Object.entries(buckets).map(([bucket, count]) => ({ bucket, count })),
      topFull: topFullArr.slice(0, 10),
      zones: Array.from(zoneAgg.entries())
        .map(([zone, v]) => ({
          zone,
          count: v.count,
          avgFill: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
          critical: v.critical,
        }))
        .sort((a, b) => b.critical - a.critical || b.avgFill - a.avgFill),
      recentAlerts,
    };
  }

  /** Time-series fill % per hour for the last `hours` (default 24). */
  static async fillTrend(dustbinId: string, hours = 24): Promise<Array<{ ts: string; value: number }>> {
    const doc = await DustbinModel.findOne({ dustbinId }).select('depth').lean();
    if (!doc) return [];
    const since = Date.now() - hours * 3600 * 1000;
    return (doc.depth ?? [])
      .filter((r) => new Date(r.timestamp).getTime() >= since)
      .map((r) => ({ ts: new Date(r.timestamp).toISOString(), value: r.value }));
  }
}
