/**
 * Centralised password policy. Used at every place we accept a new password
 * (admin user create, bulk seed, self-service change).
 *
 * Tier 1 (default): ≥10 chars, mixed letters + digit, not in tiny denylist.
 * Tier 2 (strict, opt-in via env STRICT_PASSWORD_POLICY=1): ≥12 + symbol.
 */
import { z } from 'zod';

const COMMON_DENYLIST = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  'qwerty',
  'qwerty123',
  'admin',
  'admin123',
  'letmein',
  'welcome',
  'iloveyou',
  'changeme',
  'wastemgmt',
  'coraltele',
]);

const strict = process.env.STRICT_PASSWORD_POLICY === '1';

export interface PasswordPolicyResult {
  ok: boolean;
  reason?: string;
  score: number; // 0–4 (zxcvbn-ish)
}

export function checkPassword(pw: string): PasswordPolicyResult {
  if (typeof pw !== 'string') return { ok: false, reason: 'invalid', score: 0 };
  const trimmed = pw.trim();
  const minLen = strict ? 12 : 10;
  if (trimmed.length < minLen) return { ok: false, reason: `min_length_${minLen}`, score: 0 };
  if (trimmed.length > 256) return { ok: false, reason: 'max_length_256', score: 0 };
  if (COMMON_DENYLIST.has(trimmed.toLowerCase())) return { ok: false, reason: 'common', score: 1 };

  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  const hasDigit = /\d/.test(trimmed);
  const hasSymbol = /[^A-Za-z0-9]/.test(trimmed);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (!(hasLower || hasUpper) || !hasDigit) {
    return { ok: false, reason: 'must_contain_letter_and_digit', score: classes };
  }
  if (strict && !hasSymbol) {
    return { ok: false, reason: 'must_contain_symbol', score: classes };
  }
  // Reject obvious single-char repeat runs anywhere (≥6 in a row), e.g. "aaaaaaaaaa1".
  if (/(.)\1{5,}/.test(trimmed)) {
    return { ok: false, reason: 'repeated_chars', score: 1 };
  }
  return { ok: true, score: classes };
}

/** Zod schema you can use directly: `passwordSchema.parse(pw)` throws on bad. */
export const passwordSchema = z
  .string()
  .superRefine((val, ctx) => {
    const r = checkPassword(val);
    if (!r.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `weak_password:${r.reason}`,
      });
    }
  });
