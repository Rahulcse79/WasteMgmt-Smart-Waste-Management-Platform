/**
 * Build a real Fastify app instance for HTTP-level integration tests.
 * Mirrors src/index.ts' `buildServer()` but skips MQTT/heartbeat side-effects.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from '../../src/config.js';
import { authRoutes } from '../../src/routes/auth.routes.js';
import { dustbinRoutes } from '../../src/routes/dustbins.routes.js';
import { userRoutes } from '../../src/routes/users.routes.js';
import { alertRoutes } from '../../src/routes/alerts.routes.js';
import { auditRoutes } from '../../src/routes/audit.routes.js';
import { configRoutes } from '../../src/routes/config.routes.js';
import { rulesRoutes } from '../../src/routes/rules.routes.js';
import { healthRoutes } from '../../src/routes/health.routes.js';
import { ingestRoutes } from '../../src/routes/ingest.routes.js';
import { citizenRoutes } from '../../src/routes/citizen.routes.js';
import { notificationRoutes } from '../../src/routes/notifications.routes.js';
import { routeRoutes } from '../../src/routes/route.routes.js';
import { exportRoutes } from '../../src/routes/export.routes.js';
import { analyticsRoutes } from '../../src/routes/analytics.routes.js';

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 1 * 1024 * 1024 });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 10_000, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: { private: config.JWT_ACCESS_SECRET, public: config.JWT_ACCESS_SECRET },
  });
  await app.register(websocket);

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

  await app.ready();
  return app;
}

export async function loginAs(
  app: FastifyInstance,
  username: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string; user: { id: string; role: string } }> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`login failed (${res.statusCode}): ${res.body}`);
  }
  return res.json();
}
