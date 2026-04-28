/**
 * Application logger.
 *
 * Built on pino. Driven entirely by `LOG_*` env vars (see config.ts).
 *
 * Always-on fields per record:  time (ISO), level (label), pid, hostname,
 * service, env. Errors logged via `logger.error({ err }, …)` are auto-
 * serialized to `{ type, message, stack }`.
 *
 * Output sinks (multiplexed via `pino.transport({ targets: [...] })`):
 *   • stdout              — when LOG_TO_STDOUT=true (default), pretty in dev or JSON
 *   • <LOG_DIR>/<LOG_FILE> — rotated by size (LOG_MAX_SIZE) and retention
 *     (LOG_MAX_FILES). Always JSON for log shippers / grep.
 *
 * Process-level handlers (toggleable):
 *   • LOG_EXCEPTION_HANDLERS — log uncaught exceptions
 *   • LOG_REJECTION_HANDLERS — log unhandled rejections
 *   • LOG_EXIT_ON_ERROR      — exit(1) after logging an uncaught exception
 *
 * Tests (NODE_ENV=test) skip workers entirely and write to stderr.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import pino, { type LoggerOptions, type Logger as PinoLogger } from 'pino';
import { config } from './config.js';

interface PinoTarget {
  target: string;
  level: string;
  options: Record<string, unknown>;
}

function makeTransport(): pino.DestinationStream | undefined {
  // Tests must not spawn worker threads — they leak and slow vitest hugely.
  if (config.NODE_ENV === 'test') return undefined;

  const targets: PinoTarget[] = [];

  if (config.LOG_TO_STDOUT) {
    if (config.LOG_PRETTY_PRINT && !config.LOG_JSON) {
      targets.push({
        target: 'pino-pretty',
        level: config.LOG_LEVEL,
        options: {
          colorize: config.LOG_COLORIZE,
          translateTime: config.LOG_TIMESTAMP ? 'SYS:yyyy-mm-dd HH:MM:ss.l' : false,
          ignore: 'pid,hostname,service,env',
          singleLine: false,
        },
      });
    } else {
      targets.push({
        target: 'pino/file',
        level: config.LOG_LEVEL,
        options: { destination: 1 }, // 1 = stdout
      });
    }
  }

  if (config.LOG_DIR && config.LOG_FILE) {
    try {
      mkdirSync(config.LOG_DIR, { recursive: true });
    } catch {
      /* dir already exists or unwritable — pino-roll will error visibly */
    }
    targets.push({
      target: 'pino-roll',
      level: config.LOG_LEVEL,
      options: {
        file: path.join(config.LOG_DIR, config.LOG_FILE),
        size: config.LOG_MAX_SIZE || undefined,
        limit: config.LOG_MAX_FILES > 0 ? { count: config.LOG_MAX_FILES } : undefined,
        mkdir: true,
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
      },
    });
  }

  if (targets.length === 0) return undefined;
  return pino.transport({ targets });
}

const baseOptions: LoggerOptions = {
  level: config.LOG_SILENT ? 'silent' : config.LOG_LEVEL,
  base: { service: 'wastemgmt-api', env: config.NODE_ENV },
  timestamp: config.LOG_TIMESTAMP ? pino.stdTimeFunctions.isoTime : false,
  formatters: {
    // Always emit a human-readable level label ("info") instead of pino's number.
    level(label) {
      return { level: label };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    // Never persist credentials or tokens to logs / log files.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.refreshToken',
      'req.body.password',
      'req.body.currentPassword',
      'req.body.newPassword',
    ],
    censor: '[redacted]',
  },
};

const transport = makeTransport();
export const logger: PinoLogger = transport ? pino(baseOptions, transport) : pino(baseOptions);

// ── Process-level safety nets ─────────────────────────────────────────────
if (config.NODE_ENV !== 'test' && config.LOG_EXCEPTION_HANDLERS) {
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    if (config.LOG_EXIT_ON_ERROR) process.exit(1);
  });
}
if (config.NODE_ENV !== 'test' && config.LOG_REJECTION_HANDLERS) {
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandledRejection');
  });
}

export type Logger = typeof logger;
