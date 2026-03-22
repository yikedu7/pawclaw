import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerWsRoute } from './ws/wsRoute.js';
import { registerTickRoute } from './api/tick-route.js';

const fastify = Fastify({ logger: true });

await fastify.register(fastifyWebsocket);
await registerWsRoute(fastify);
await registerTickRoute(fastify);

const port = Number(process.env.PORT ?? 3001);
await fastify.listen({ port, host: '0.0.0.0' });
