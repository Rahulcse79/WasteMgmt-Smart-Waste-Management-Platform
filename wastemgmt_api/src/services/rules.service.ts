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

// Built-in alert cooldown: don't re-fire the same built-in alert for the same
// dustbin/type more often than this. Mirrors the per-rule cooldown contract.
const BUILTIN_COOLDOWN_MS = 5 * 60 * 1000;
const builtinLastFire = new Map<string, number>();

function builtinKey(dustbinId: string, type: string): string {
  return `${dustbinId}::${type}`;
}

function shouldFireBuiltin(dustbinId: string, type: string, now: number): boolean {
  const key = builtinKey(dustbinId, type);
  const last = builtinLastFire.get(key);
  if (last && now - last < BUILTIN_COOLDOWN_MS) return false;
  builtinLastFire.set(key, now);
  return true;
}

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
    const effectiveTenant = tenantId ?? 'default';

    // ── Built-in safety nets (always on, with per-bin cooldown) ────────────
    await this.evaluateBuiltins(dustbinId, metric, value, effectiveTenant);

    // ── Admin-configured rules — scoped to this tenant ─────────────────────
    const rules = await RuleModel.find({ enabled: true, metric, tenantId: effectiveTenant });
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

      // Persist the cooldown FIRST and atomically. If we wrote the cooldown
      // after raising the alert, two concurrent ingests could both pass the
      // check above and raise duplicate alerts. The conditional update only
      // succeeds for the first writer per cooldown window.
      const cooldownCutoff = new Date(now.getTime() - rule.cooldownSec * 1000);
      const claim = await RuleModel.updateOne(
        {
          _id: rule._id,
          $or: [
            { [`lastFiredAt.${dustbinId}`]: { $exists: false } },
            { [`lastFiredAt.${dustbinId}`]: { $lte: cooldownCutoff } },
          ],
        },
        { $set: { [`lastFiredAt.${dustbinId}`]: now } }
      );
      if (claim.modifiedCount === 0) continue;

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
    }
  }

  private static async evaluateBuiltins(
    dustbinId: string,
    metric: Metric,
    value: number,
    tenantId: string
  ): Promise<void> {
    const now = Date.now();
    if (metric === 'depth' && value >= 80 && shouldFireBuiltin(dustbinId, 'BIN_FULL', now)) {
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
    if (metric === 'gas' && value >= 300 && shouldFireBuiltin(dustbinId, 'GAS_HIGH', now)) {
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
