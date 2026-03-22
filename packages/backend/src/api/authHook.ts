import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

declare module 'fastify' {
  interface FastifyRequest {
    owner_id: string;
  }
}

export function authHook(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }

    const token = header.slice(7);
    try {
      const secret = process.env.JWT_SECRET ?? 'dev-secret';
      const payload = jwt.verify(token, secret) as jwt.JwtPayload;
      if (!payload.sub) throw new Error('missing sub');
      request.owner_id = payload.sub;
    } catch {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }
  };
}
