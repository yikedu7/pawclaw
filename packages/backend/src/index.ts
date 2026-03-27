import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { and, eq, isNull } from 'drizzle-orm';
import { registerWsRoute } from './ws/wsRoute.js';
import './ws/wsEmitter.js'; // subscribes tickBus events → WebSocket clients
import { registerTickRoute } from './runtime/tick-route.js';
import { registerPetRoutes } from './api/petRoutes.js';
import { registerChatRoute } from './api/chatRoute.js';
import { registerDiaryRoute } from './social/diary.js';
import { registerOpenclawRoutes } from './api/openclawRoutes.js';
import { generateSoulMd } from './runtime/soul-generator.js';
import { generateSkillMd } from './runtime/skill-generator.js';
import { createPetContainer, startContainer, stopContainer, containerChat, containerChatStream, fetchWalletAddress } from './runtime/container.js';
import { tickBus } from './runtime/tick-bus.js';
import { db } from './db/client.js';
import { pets } from './db/schema.js';
import { startBalancePoller } from './runtime/balance-poller.js';

const fastify = Fastify({ logger: true });

fastify.get('/health', async () => ({ status: 'ok' }));

await fastify.register(fastifyCors, { origin: true });
await fastify.register(fastifyWebsocket);
await registerWsRoute(fastify);
await registerTickRoute(fastify);
await registerPetRoutes(fastify, {
  generateSoulMd,
  generateSkillMd,
  emitOwnerEvent: (ownerId, event) => tickBus.emit('ownerEvent', ownerId, event),
  launchContainer: process.env.HETZNER_HOST
    ? (petId, soulMd, skillMd) => {
        createPetContainer(petId, soulMd, skillMd)
          .then(async ({ containerId }) => {
            try {
              await startContainer(containerId);
            } catch (err: unknown) {
              // Health probe timed out but container may still be running.
              // Mark running so the tick loop can reach it; continue to wallet write-back.
              fastify.log.warn({ err, petId, containerId }, '[container] startContainer failed — marking running and continuing');
              await db.update(pets).set({ container_status: 'running' }).where(eq(pets.container_id, containerId));
            }

            // Wallet address write-back: Onchain OS assigns wallet asynchronously after container start.
            // Retry every 3s up to 30s, then grant 200 PAW registration credits.
            const address = await fetchWalletAddress(containerId);
            if (address) {
              await db.update(pets).set({ wallet_address: address }).where(eq(pets.container_id, containerId));
              fastify.log.info({ petId, containerId, address }, '[wallet] Address written back');
            } else {
              fastify.log.warn({ petId, containerId }, '[wallet] Address not found within 30s');
            }
          })
          .catch((err: unknown) => fastify.log.error({ err, petId }, 'container lifecycle failed'));
      }
    : undefined,
  reviveContainer: process.env.HETZNER_HOST
    ? (containerId) => startContainer(containerId)
    : undefined,
});
await registerChatRoute(fastify, {
  emitOwnerEvent: (ownerId, event) => tickBus.emit('ownerEvent', ownerId, event),
  containerChat,
  containerChatStream,
  stopPetContainer: stopContainer,
});
await registerDiaryRoute(fastify);
await registerOpenclawRoutes(fastify, {
  emitOwnerEvent: (ownerId, event) => tickBus.emit('ownerEvent', ownerId, event),
  stopPetContainer: stopContainer,
});

if (process.env.PAYMENT_TOKEN_ADDRESS) {
  startBalancePoller(fastify.log);
}

const port = Number(process.env.PORT ?? 3001);
await fastify.listen({ port, host: '0.0.0.0' });

// Startup recovery: re-launch any pets whose container launch was interrupted by a prior
// deployment. container_status='created' + container_id=null means createPetContainer
// never completed (process was killed mid-flight). Fire-and-forget — failures are logged.
if (process.env.HETZNER_HOST) {
  const orphaned = await db
    .select({ id: pets.id, soul_md: pets.soul_md, skill_md: pets.skill_md })
    .from(pets)
    .where(and(eq(pets.container_status, 'created'), isNull(pets.container_id)));

  if (orphaned.length > 0) {
    fastify.log.warn({ count: orphaned.length }, '[startup] Relaunching orphaned pets');
    for (const pet of orphaned) {
      const petId = pet.id;
      createPetContainer(petId, pet.soul_md, pet.skill_md)
        .then(async ({ containerId }) => {
          try {
            await startContainer(containerId);
          } catch (err: unknown) {
            fastify.log.warn({ err, petId, containerId }, '[startup] startContainer failed — marking running and continuing');
            await db.update(pets).set({ container_status: 'running' }).where(eq(pets.container_id, containerId));
          }
          const address = await fetchWalletAddress(containerId);
          if (address) {
            await db.update(pets).set({ wallet_address: address }).where(eq(pets.container_id, containerId));
            fastify.log.info({ petId, containerId, address }, '[startup] Wallet address written back');
          } else {
            fastify.log.warn({ petId, containerId }, '[startup] Wallet address not found');
          }
        })
        .catch((err: unknown) => fastify.log.error({ err, petId }, '[startup] container lifecycle failed'));
    }
  }
}
