import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables explicitly to avoid process-manager differences
// where `dotenv/config` might miss `.env.local`.
const envCandidates = [process.env.DOTENV_CONFIG_PATH, '.env.local', '.env'].filter(
  (v): v is string => Boolean(v && v.trim())
);
for (const candidate of envCandidates) {
  const envPath = resolve(process.cwd(), candidate);
  if (!existsSync(envPath)) continue;
  dotenv.config({ path: envPath });
  break;
}

/** Parse "true"/"1"/"yes"/"on" → true; everything else → false. Avoids the
 *  `z.coerce.boolean()` pitfall where the string "false" coerces to true. */
const envBool = (defaultValue = false) =>
  z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (v === undefined) return defaultValue;
      return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
    });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3023),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  PUBLIC_ORIGIN: z.string().default(''),

  MONGODB_URI: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  PAYLOAD_ENC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'PAYLOAD_ENC_KEY must be 64 hex chars (32 bytes)'),

  SEED_ADMIN_USERNAME: z.string().default('admin'),
  SEED_ADMIN_PASSWORD: z.string().default('admin'),
  SEED_USER_USERNAME: z.string().default('user'),
  SEED_USER_PASSWORD: z.string().default('user'),

  MQTT_ENABLED: envBool(false),
  MQTT_HOST: z.string().default('localhost'),
  MQTT_PORT: z.coerce.number().int().positive().default(8883),
  MQTT_PROTOCOL: z.enum(['mqtt', 'mqtts', 'ws', 'wss']).default('mqtts'),
  MQTT_CLIENT_ID: z.string().default('wastemgmt-api'),
  MQTT_TOPIC: z.string().default('/oneM2M/resp/#'),
  MQTT_CA_CERT: z.string().optional(),
  MQTT_CLIENT_CERT: z.string().optional(),
  MQTT_CLIENT_KEY: z.string().optional(),
  MQTT_REJECT_UNAUTHORIZED: envBool(true),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: envBool(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('no-reply@example.com'),
  ALERT_EMAIL_TO: z.string().default(''),

  REDIS_ENABLED: envBool(false),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  // ── Logging ────────────────────────────────────────────────────────────
  // Where rotated log files are written. Empty disables file logging.
  LOG_DIR: z.string().default('logs'),
  LOG_FILE: z.string().default('app.log'),
  // pino-roll: max size before rolling (e.g. "10m", "1g"). Empty = no size cap.
  LOG_MAX_SIZE: z.string().default('10m'),
  // pino-roll: how many rolled files to keep. 0 = unlimited.
  LOG_MAX_FILES: z.coerce.number().int().nonnegative().default(5),
  // Structured JSON output (production-friendly). When false, pino-pretty is used.
  LOG_JSON: envBool(false),
  LOG_COLORIZE: envBool(true),
  LOG_TIMESTAMP: envBool(true),
  LOG_PRETTY_PRINT: envBool(true),
  LOG_SILENT: envBool(false),
  LOG_EXCEPTION_HANDLERS: envBool(true),
  LOG_REJECTION_HANDLERS: envBool(true),
  LOG_EXIT_ON_ERROR: envBool(false),
  // Mirror logs to stdout in addition to the rotated file. Recommended on.
  LOG_TO_STDOUT: envBool(true),

  // Strict password policy toggle (enforces ≥12 chars + symbol).
  STRICT_PASSWORD_POLICY: envBool(false),

  CAMERA_STREAM_1: z.string().default(''),
  CAMERA_STREAM_2: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
};

export type AppConfig = typeof config;
