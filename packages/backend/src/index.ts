import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { registerWsRoute } from './ws/wsRoute.js';
import './ws/wsEmitter.js'; // subscribes tickBus events → WebSocket clients
import { registerTickRoute } from './runtime/tick-route.js';
import { registerPetRoutes } from './api/petRoutes.js';
import { registerChatRoute } from './api/chatRoute.js';
import { registerDiaryRoute } from './social/diary.js';
import { generateSoulMd } from './runtime/soul-generator.js';
import { generateSkillMd } from './runtime/skill-generator.js';
import { tickBus } from './runtime/tick-bus.js';

const fastify = Fastify({ logger: true });

await fastify.register(fastifyCors, { origin: true });
await fastify.register(fastifyWebsocket);
await registerWsRoute(fastify);
await registerTickRoute(fastify);
await registerPetRoutes(fastify, { generateSoulMd, generateSkillMd });
await registerChatRoute(fastify, {
  emitOwnerEvent: (ownerId, event) => tickBus.emit('ownerEvent', ownerId, event),
});
await registerDiaryRoute(fastify);

const port = Number(process.env.PORT ?? 3001);
await fastify.listen({ port, host: '0.0.0.0' });
