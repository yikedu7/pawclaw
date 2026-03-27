import { createSecretKey } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

declare module 'fastify' {
  interface FastifyRequest {
    owner_id: string;
  }
}

// Lazy JWKS instance — initialized on first request to avoid module-load crash
// when SUPABASE_URL is not yet set (e.g. vitest workers).
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
      let sub: string | undefined;

      if (process.env.SUPABASE_URL) {
        // Production / local Supabase with JWKS support
        const { payload } = await jwtVerify(token, getJWKS());
        sub = payload.sub;
      } else {
        // Test environments: HS256 symmetric key via JWT_SECRET
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('Either SUPABASE_URL or JWT_SECRET must be set');
        const { payload } = await jwtVerify(token, createSecretKey(Buffer.from(secret)));
        sub = payload.sub;
      }

      if (!sub) throw new Error('missing sub');
      request.owner_id = sub;
    } catch {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }
  };
}
