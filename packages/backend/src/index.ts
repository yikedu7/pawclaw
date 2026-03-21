import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import { registerOwner, unregisterOwner } from './ws/wsRegistry.js';

const fastify = Fastify({ logger: true });
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

await fastify.register(fastifyWebsocket);

fastify.get('/ws', { websocket: true }, (socket, req) => {
  const token = (req.query as Record<string, string>).token;

  if (!token) {
    socket.close(4001, 'token required');
    return;
  }

  let ownerId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
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

const port = Number(process.env.PORT ?? 3001);
await fastify.listen({ port, host: '0.0.0.0' });
