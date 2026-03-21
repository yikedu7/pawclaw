import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerOwner, unregisterOwner } from './ws/wsRegistry.js';

const fastify = Fastify({ logger: true });

await fastify.register(fastifyWebsocket);

fastify.get('/ws', { websocket: true }, (socket, req) => {
  const ownerId = (req.query as Record<string, string>).owner_id;

  if (!ownerId) {
    socket.close(4001, 'owner_id required');
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
