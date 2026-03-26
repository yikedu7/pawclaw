import { createSecretKey } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { WsQuerySchema } from '@pawclaw/shared';
import { registerOwner, unregisterOwner } from './wsRegistry.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const JWKS = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));

// Local Supabase uses HS256 (symmetric) — JWKS returns empty keys.
// Fall back to JWT_SECRET for local dev (mirrors authHook.ts).
const jwtSecret = process.env.JWT_SECRET
  ? createSecretKey(Buffer.from(process.env.JWT_SECRET))
  : null;

async function verifyToken(token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, JWKS);
    if (!payload.sub) throw new Error('missing sub');
    return payload.sub;
  } catch {
    if (!jwtSecret) throw new Error('JWKS failed and no JWT_SECRET set');
    const { payload } = await jwtVerify(token, jwtSecret);
    if (!payload.sub) throw new Error('missing sub');
    return payload.sub;
  }
}

export async function registerWsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const query = WsQuerySchema.safeParse(req.query);
    if (!query.success) {
      socket.close(4001, 'token required');
      return;
    }

    verifyToken(query.data.token)
      .then((ownerId) => {
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
