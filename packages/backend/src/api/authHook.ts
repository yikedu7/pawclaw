import { createSecretKey } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

declare module 'fastify' {
  interface FastifyRequest {
    owner_id: string;
  }
}

const supabaseUrl = process.env.SUPABASE_URL!;
const JWKS = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));

// Local Supabase uses HS256 (symmetric) — JWKS returns empty keys.
// Fall back to JWT_SECRET for local dev; in production JWKS succeeds and this is never reached.
const jwtSecret = process.env.JWT_SECRET
  ? createSecretKey(Buffer.from(process.env.JWT_SECRET))
  : null;

export function authHook(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }

    const token = header.slice(7);
    try {
      try {
        const { payload } = await jwtVerify(token, JWKS);
        if (!payload.sub) throw new Error('missing sub');
        request.owner_id = payload.sub;
      } catch {
        if (!jwtSecret) throw new Error('JWKS failed and no JWT_SECRET set');
        const { payload } = await jwtVerify(token, jwtSecret);
        if (!payload.sub) throw new Error('missing sub');
        request.owner_id = payload.sub;
      }
    } catch {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }
  };
}
