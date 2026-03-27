import type { FastifyInstance } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { WsQuerySchema } from '@pawclaw/shared';
import { registerOwner, unregisterOwner } from './wsRegistry.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const JWKS = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));

export async function registerWsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const query = WsQuerySchema.safeParse(req.query);
    if (!query.success) {
      socket.close(4001, 'token required');
      return;
    }

    jwtVerify(query.data.token, JWKS)
      .then(({ payload }) => {
        if (!payload.sub) throw new Error('missing sub');
        const ownerId = payload.sub;

        registerOwner(ownerId, socket);
        fastify.log.info({ ownerId }, 'ws client connected');

        socket.on('message', (raw: Buffer) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
          } catch {
            // ignore malformed messages
          }
        });

        socket.on('close', () => {
          unregisterOwner(ownerId);
          fastify.log.info({ ownerId }, 'ws client disconnected');
        });
      })
      .catch(() => {
        socket.close(4001, 'invalid token');
      });
  });
}
