import { createSecretKey } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

declare module 'fastify' {
  interface FastifyRequest {
    owner_id: string;
  }
}

// Lazily resolved verifier — supports two modes:
//   1. JWKS (production + local Supabase with JWKS support): when SUPABASE_URL is set
//   2. HS256 symmetric key (tests + legacy local): when JWT_SECRET is set and SUPABASE_URL is not
function buildVerifier() {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (supabaseUrl) {
    return createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Either SUPABASE_URL or JWT_SECRET must be set');
  return createSecretKey(Buffer.from(secret));
}

let _verifier: ReturnType<typeof buildVerifier> | undefined;
function getVerifier() {
  if (!_verifier) _verifier = buildVerifier();
  return _verifier;
}

export function authHook(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }

    const token = header.slice(7);
    try {
      const { payload } = await jwtVerify(token, getVerifier());
      if (!payload.sub) throw new Error('missing sub');
      request.owner_id = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }
  };
}
