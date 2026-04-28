import type { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthUser {
  sub: string;
  username: string;
  role: 'admin' | 'user';
  type: 'access' | 'refresh';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

/** Verifies an access token; populates `request.user`. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify();
    if (req.user?.type !== 'access') {
      return reply.code(401).send({ error: 'Invalid token type' });
    }
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

/** Restrict route to one or more roles. Use after `requireAuth`. */
export function requireRole(...roles: Array<'admin' | 'user'>) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user || !roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
