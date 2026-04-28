import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeAny, z } from 'zod';

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.flatten() });
    }
    (req as { body: z.infer<T> }).body = parsed.data;
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.flatten() });
    }
    (req as { query: z.infer<T> }).query = parsed.data;
  };
}
