import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    db: mongoose.connection.readyState === 1 ? 'up' : 'down',
    ts: new Date().toISOString(),
  }));

  app.get('/health/ready', async (_req, reply) => {
    if (mongoose.connection.readyState !== 1) return reply.code(503).send({ ready: false });
    return { ready: true };
  });
}
