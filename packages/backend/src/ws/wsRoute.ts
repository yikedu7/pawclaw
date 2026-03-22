import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { WsQuerySchema } from '@x-pet/shared';
import { registerOwner, unregisterOwner } from './wsRegistry.js';

export async function registerWsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const query = WsQuerySchema.safeParse(req.query);
    if (!query.success) {
      socket.close(4001, 'token required');
      return;
    }

    let ownerId: string;
    try {
      const secret = process.env.JWT_SECRET ?? 'dev-secret';
      const payload = jwt.verify(query.data.token, secret) as jwt.JwtPayload;
      if (!payload.sub) throw new Error('missing sub');
      ownerId = payload.sub;
    } catch {
      socket.close(4001, 'invalid token');
      return;
    }

    registerOwner(ownerId, socket);
    fastify.log.info({ ownerId }, 'ws client connected');

    // heartbeat: client sends ping, server sends pong
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
  });
}
