import { RuleModel } from '../models/Rule.js';
import { AlertService } from './alert.service.js';
import type { Metric } from './dustbin.service.js';

const ops: Record<string, (a: number, b: number) => boolean> = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
};

export class RulesService {
  /**
   * Evaluate all enabled rules for a freshly ingested reading. Honours per-rule
   * cooldown and dustbin scoping. Built-in (non-rule) thresholds also apply.
   */
  static async evaluate(input: {
    dustbinId: string;
    metric: Metric;
    value: number;
    tenantId?: string;
  }): Promise<void> {
    const { dustbinId, metric, value, tenantId } = input;

    // ── Built-in safety nets (always on) ──────────────────────────────────
    await this.evaluateBuiltins(dustbinId, metric, value, tenantId);

    // ── Admin-configured rules ────────────────────────────────────────────
    const rules = await RuleModel.find({ enabled: true, metric });
    const now = new Date();

    for (const rule of rules) {
      if (
        rule.appliesToDustbinIds &&
        rule.appliesToDustbinIds.length > 0 &&
        !rule.appliesToDustbinIds.includes(dustbinId)
      ) {
        continue;
      }
      const op = ops[rule.operator];
      if (!op || !op(value, rule.threshold)) continue;

      const lastFired = rule.lastFiredAt?.get?.(dustbinId);
      if (lastFired && now.getTime() - new Date(lastFired).getTime() < rule.cooldownSec * 1000) {
        continue;
      }

      await AlertService.raise({
        dustbinId,
        type: rule.alertType,
        severity: rule.severity,
        message: `Rule "${rule.name}" tripped: ${metric} ${rule.operator} ${rule.threshold} (got ${value})`,
        metric,
        value,
        threshold: rule.threshold,
        tenantId: rule.tenantId,
        notifyEmail: rule.notifyEmail,
      });

      rule.lastFiredAt?.set?.(dustbinId, now);
      await rule.save();
    }
  }

  private static async evaluateBuiltins(
    dustbinId: string,
    metric: Metric,
    value: number,
    tenantId?: string
  ): Promise<void> {
    if (metric === 'depth' && value >= 80) {
      await AlertService.raise({
        dustbinId,
        type: 'BIN_FULL',
        severity: value >= 95 ? 'critical' : 'warning',
        message: `Dustbin ${dustbinId} is ${value.toFixed(1)}% full`,
        metric,
        value,
        threshold: 80,
        tenantId,
        notifyEmail: value >= 95,
      });
    }
    if (metric === 'gas' && value >= 300) {
      await AlertService.raise({
        dustbinId,
        type: 'GAS_HIGH',
        severity: value >= 500 ? 'critical' : 'warning',
        message: `High gas reading at ${dustbinId}: ${value} ppm`,
        metric,
        value,
        threshold: 300,
        tenantId,
        notifyEmail: value >= 500,
      });
    }
  }
}
