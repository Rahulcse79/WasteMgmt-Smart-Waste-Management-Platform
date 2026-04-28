import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RouteService } from '../services/route.service.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const OptimizeSchema = z.object({
  depotLat: z.number().min(-90).max(90),
  depotLng: z.number().min(-180).max(180),
  fillThreshold: z.number().min(0).max(100).optional(),
  zone: z.string().trim().max(64).optional(),
  limit: z.number().int().positive().max(200).optional(),
  avgKmh: z.number().positive().max(120).optional(),
  serviceMinPerStop: z.number().min(0).max(60).optional(),
});

export async function routeRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/routes/optimize',
    { preHandler: [requireAuth, validateBody(OptimizeSchema)] },
    async (req) => RouteService.optimize(req.body as z.infer<typeof OptimizeSchema>)
  );
}
