import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { logger } from './logger.js';
import { connectDB, disconnectDB } from './db.js';
import { authRoutes } from './routes/auth.routes.js';
import { dustbinRoutes } from './routes/dustbins.routes.js';
import { userRoutes } from './routes/users.routes.js';
import { alertRoutes } from './routes/alerts.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { configRoutes } from './routes/config.routes.js';
import { rulesRoutes } from './routes/rules.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { ingestRoutes } from './routes/ingest.routes.js';
import { citizenRoutes } from './routes/citizen.routes.js';
import { notificationRoutes } from './routes/notifications.routes.js';
import { routeRoutes } from './routes/route.routes.js';
import { exportRoutes } from './routes/export.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { sensorReadingsRoutes } from './routes/sensorReadings.routes.js';
import { MqttService } from './services/mqtt.service.js';
import { HeartbeatService } from './services/heartbeat.service.js';
import { wsHub } from './services/ws.service.js';
import { UserModel } from './models/User.js';
import { runSeed } from './seed.js';

async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024,
    disableRequestLogging: false,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // server-to-server, curl
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS blocked'), false);
    },
    credentials: true,
  });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
  });
  await app.register(jwt, {
    secret: { private: config.JWT_ACCESS_SECRET, public: config.JWT_ACCESS_SECRET },
  });
  await app.register(websocket);

  // ── REST routes ────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(dustbinRoutes);
  await app.register(userRoutes);
  await app.register(alertRoutes);
  await app.register(auditRoutes);
  await app.register(configRoutes);
  await app.register(rulesRoutes);
  await app.register(ingestRoutes);
  await app.register(citizenRoutes);
  await app.register(notificationRoutes);
  await app.register(routeRoutes);
  await app.register(exportRoutes);
  await app.register(analyticsRoutes);
  await app.register(sensorReadingsRoutes);

  // ── WebSocket gateway ──────────────────────────────────────────────────
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const url = new URL(req.url ?? '/ws', 'http://localhost');
    const token = url.searchParams.get('token');
    const topicsParam = url.searchParams.get('topics') ?? '*';
    if (!token) {
      socket.close(1008, 'token required');
      return;
    }
    try {
      const decoded = app.jwt.verify(token) as {
        sub: string;
        username: string;
        role: 'admin' | 'user';
        type: string;
      };
      if (decoded.type !== 'access') {
        socket.close(1008, 'bad token type');
        return;
      }
      // Look up the per-user dustbin scope so we can enforce it on every send.
      let allowed: Set<string> | undefined;
      if (decoded.role !== 'admin') {
        const u = await UserModel.findById(decoded.sub).select('assignedDustbins isActive').lean();
        if (!u || !u.isActive) {
          socket.close(1008, 'inactive');
          return;
        }
        allowed = new Set(u.assignedDustbins ?? []);
      }
      const sub = {
        socket,
        user: { sub: decoded.sub, username: decoded.username, role: decoded.role, type: 'access' as const },
        topics: new Set(topicsParam.split(',').map((t) => t.trim()).filter(Boolean)),
        allowedDustbins: allowed,
      };
      wsHub.add(sub);
      socket.on('close', () => wsHub.remove(sub));
      // Cap message rate from clients (protects the hub from chatty/abusive sockets).
      let recentMsgs = 0;
      const recentReset = setInterval(() => {
        recentMsgs = 0;
      }, 1000);
      socket.on('close', () => clearInterval(recentReset));
      socket.on('message', (raw) => {
        recentMsgs++;
        if (recentMsgs > 60) {
          socket.close(1008, 'rate_limit');
          return;
        }
        if ((raw as Buffer).length > 8 * 1024) {
          socket.close(1009, 'message_too_large');
          return;
        }
        try {
          const msg = JSON.parse(String(raw)) as { action?: string; topics?: string[] };
          if (msg.action === 'subscribe' && Array.isArray(msg.topics)) {
            for (const t of msg.topics) sub.topics.add(t);
          } else if (msg.action === 'unsubscribe' && Array.isArray(msg.topics)) {
            for (const t of msg.topics) sub.topics.delete(t);
          }
        } catch {
          /* ignore malformed */
        }
      });
      socket.send(
        JSON.stringify({
          event: 'hello',
          payload: { user: decoded.username, role: decoded.role },
        })
      );
    } catch {
      socket.close(1008, 'invalid token');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'Unhandled error');
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode) {
      return reply.code(e.statusCode).send({ error: e.message ?? 'Error' });
    }
    return reply.code(500).send({ error: 'Internal Server Error' });
  });

  return app;
}

async function main(): Promise<void> {
  await connectDB();
  await runSeed();
  const app = await buildServer();
  MqttService.start();
  HeartbeatService.start();

  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(`🚀 API listening on http://${config.HOST}:${config.PORT}`);

  const shutdown = async (signal: string) => {
    logger.warn({ signal }, 'Shutting down…');
    HeartbeatService.stop();
    await MqttService.stop();
    await app.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
