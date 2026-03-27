import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

declare module 'fastify' {
  interface FastifyRequest {
    owner_id: string;
  }
}

// Lazy JWKS instance — deferred until first request so module load does not
// crash when SUPABASE_URL is evaluated before env is fully initialised.
let _jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function getJWKS() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  }
  return _jwks;
}

export function authHook(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }

    const token = header.slice(7);
    try {
      const { payload } = await jwtVerify(token, getJWKS());
      if (!payload.sub) throw new Error('missing sub');
      request.owner_id = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }
  };
}
