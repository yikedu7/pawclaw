import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { WsEvent } from '@x-pet/shared';
import { db } from '../db/client.js';
import { pets } from '../db/schema.js';
import { executeVisit } from '../social/visit.js';

export type OpenclawRouteDeps = {
  emitOwnerEvent: (ownerId: string, event: WsEvent) => void;
};

function checkBearerToken(authHeader: string | undefined): boolean {
  const token = process.env.OPENCLAW_WEBHOOK_TOKEN;
  if (!token) return false;
  return authHeader === `Bearer ${token}`;
}

const PetIdSchema = z.string().uuid();

const RuntimeEventSchema = z.discriminatedUnion('event_type', [
  z.object({ event_type: z.literal('speak'), message: z.string() }),
  z.object({ event_type: z.literal('visit'), target_pet_id: z.string().uuid(), greeting: z.string() }),
  z.object({ event_type: z.literal('gift'), target_pet_id: z.string().uuid(), amount: z.string() }),
  z.object({ event_type: z.literal('rest') }),
  z.object({
    event_type: z.literal('state_update'),
    hunger: z.number().int().min(0).max(100).optional(),
    mood: z.number().int().min(0).max(100).optional(),
  }),
]);

export async function registerOpenclawRoutes(
  fastify: FastifyInstance,
  deps: OpenclawRouteDeps,
) {
  // ── POST /internal/runtime/events/:petId ──────────────────────────────────
  // Receives lifecycle/action events from the OpenClaw container.
  // Auth: per-pet gateway_token (set by OpenClaw on container start).
  fastify.post('/internal/runtime/events/:petId', async (request, reply) => {
    const petIdParsed = PetIdSchema.safeParse((request.params as { petId: string }).petId);
    if (!petIdParsed.success) {
      return reply.code(400).send({ error: 'Invalid petId', code: 'VALIDATION_ERROR' });
    }
    const petId = petIdParsed.data;

    const bodyParsed = RuntimeEventSchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.code(400).send({ error: bodyParsed.error.message, code: 'VALIDATION_ERROR' });
    }

    const pet = await db.query.pets.findFirst({ where: eq(pets.id, petId) });
    if (!pet) return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });

    if (!pet.gateway_token || request.headers.authorization !== `Bearer ${pet.gateway_token}`) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const event = bodyParsed.data;

    switch (event.event_type) {
      case 'speak':
        deps.emitOwnerEvent(pet.owner_id, {
          type: 'pet.speak',
          data: { pet_id: petId, message: event.message },
        });
        break;

      case 'visit':
        await executeVisit(petId, event.target_pet_id, event.greeting);
        break;

      case 'gift':
        // TODO(#16): X402 payment — call pet wallet via Onchain OS to send OKB on X Layer
        deps.emitOwnerEvent(pet.owner_id, {
          type: 'social.gift',
          data: { from_pet_id: petId, to_pet_id: event.target_pet_id, token: 'OKB', amount: event.amount, tx_hash: null },
        });
        break;

      case 'rest': {
        const newHunger = Math.min(100, pet.hunger + 10);
        const newMood = Math.min(100, pet.mood + 5);
        await db.update(pets).set({ hunger: newHunger, mood: newMood }).where(eq(pets.id, petId));
        deps.emitOwnerEvent(pet.owner_id, {
          type: 'pet.state',
          data: { pet_id: petId, hunger: newHunger, mood: newMood, affection: pet.affection },
        });
        break;
      }

      case 'state_update': {
        const updates: Partial<{ hunger: number; mood: number }> = {};
        if (event.hunger !== undefined) updates.hunger = event.hunger;
        if (event.mood !== undefined) updates.mood = event.mood;
        if (Object.keys(updates).length > 0) {
          await db.update(pets).set(updates).where(eq(pets.id, petId));
        }
        deps.emitOwnerEvent(pet.owner_id, {
          type: 'pet.state',
          data: {
            pet_id: petId,
            hunger: updates.hunger ?? pet.hunger,
            mood: updates.mood ?? pet.mood,
            affection: pet.affection,
          },
        });
        break;
      }
    }

    return reply.send({ ok: true });
  });

  // ── POST /internal/tools/visit_pet ────────────────────────────────────────
  fastify.post('/internal/tools/visit_pet', async (request, reply) => {
    if (!checkBearerToken(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const parsed = z.object({
      pet_id: z.string().uuid(),
      target_pet_id: z.string().uuid(),
      greeting: z.string(),
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
    }
    await executeVisit(parsed.data.pet_id, parsed.data.target_pet_id, parsed.data.greeting);
    return reply.send({ ok: true });
  });

  // ── POST /internal/tools/speak ────────────────────────────────────────────
  fastify.post('/internal/tools/speak', async (request, reply) => {
    if (!checkBearerToken(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const parsed = z.object({ pet_id: z.string().uuid(), message: z.string() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
    }
    const pet = await db.query.pets.findFirst({ where: eq(pets.id, parsed.data.pet_id) });
    if (!pet) return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    deps.emitOwnerEvent(pet.owner_id, {
      type: 'pet.speak',
      data: { pet_id: parsed.data.pet_id, message: parsed.data.message },
    });
    return reply.send({ ok: true });
  });

  // ── POST /internal/tools/rest ─────────────────────────────────────────────
  fastify.post('/internal/tools/rest', async (request, reply) => {
    if (!checkBearerToken(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const parsed = z.object({ pet_id: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
    }
    const pet = await db.query.pets.findFirst({ where: eq(pets.id, parsed.data.pet_id) });
    if (!pet) return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    const newHunger = Math.min(100, pet.hunger + 10);
    const newMood = Math.min(100, pet.mood + 5);
    await db.update(pets).set({ hunger: newHunger, mood: newMood }).where(eq(pets.id, parsed.data.pet_id));
    deps.emitOwnerEvent(pet.owner_id, {
      type: 'pet.state',
      data: { pet_id: parsed.data.pet_id, hunger: newHunger, mood: newMood, affection: pet.affection },
    });
    return reply.send({ ok: true });
  });

  // ── POST /internal/tools/send_gift ────────────────────────────────────────
  fastify.post('/internal/tools/send_gift', async (request, reply) => {
    if (!checkBearerToken(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const parsed = z.object({
      pet_id: z.string().uuid(),
      target_pet_id: z.string().uuid(),
      amount: z.string(),
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
    }
    const pet = await db.query.pets.findFirst({ where: eq(pets.id, parsed.data.pet_id) });
    if (!pet) return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    // TODO(#16): X402 payment — call pet wallet via Onchain OS to send OKB on X Layer
    deps.emitOwnerEvent(pet.owner_id, {
      type: 'social.gift',
      data: { from_pet_id: parsed.data.pet_id, to_pet_id: parsed.data.target_pet_id, token: 'OKB', amount: parsed.data.amount, tx_hash: null },
    });
    return reply.send({ ok: true });
  });
}
