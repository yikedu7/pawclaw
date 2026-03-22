import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { PetCreateSchema, PetIdParamSchema } from '@x-pet/shared';
import { db } from '../db/client.js';
import { pets } from '../db/schema.js';
import { authHook } from './authHook.js';

export type PetRouteDeps = {
  generateSoulMd: (input: { name: string; mood: number; soul_prompt: string }) => string;
  generateSkillMd: (input: { id: string; backendUrl: string }) => string;
};

function toPetState(row: typeof pets.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    // TODO(#39): return real Onchain OS wallet address once container lifecycle manager lands
    wallet_address: row.wallet_address ?? '',
    hunger: row.hunger,
    mood: row.mood,
    affection: row.affection,
  };
}

export async function registerPetRoutes(
  fastify: FastifyInstance,
  deps: PetRouteDeps,
): Promise<void> {
  const auth = authHook(fastify);

  // POST /api/pets — create a new pet
  fastify.post('/api/pets', { preHandler: auth }, async (request, reply) => {
    const parsed = PetCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues.map((i: { message: string }) => i.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }

    const { name, soul_prompt } = parsed.data;
    const ownerId = request.owner_id;

    const soul_md = deps.generateSoulMd({ name, mood: 100, soul_prompt });
    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';

    // Insert the pet row first to get the id (skill_md needs it)
    const [row] = await db
      .insert(pets)
      .values({
        owner_id: ownerId,
        name,
        soul_md,
        skill_md: '', // placeholder — updated below
      })
      .returning();

    // Generate skill_md with the real pet id
    const skill_md = deps.generateSkillMd({ id: row.id, backendUrl });
    const [updated] = await db
      .update(pets)
      .set({ skill_md })
      .where(eq(pets.id, row.id))
      .returning();

    return reply.code(201).send(toPetState(updated));
  });

  // GET /api/pets — list all pets for the authenticated owner
  fastify.get('/api/pets', { preHandler: auth }, async (request, reply) => {
    const rows = await db
      .select()
      .from(pets)
      .where(eq(pets.owner_id, request.owner_id));

    return reply.send(rows.map(toPetState));
  });

  // GET /api/pets/:id — get a single pet
  fastify.get('/api/pets/:id', { preHandler: auth }, async (request, reply) => {
    const parsed = PetIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid pet id',
        code: 'VALIDATION_ERROR',
      });
    }

    const [row] = await db
      .select()
      .from(pets)
      .where(eq(pets.id, parsed.data.id));

    if (!row) {
      return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    }

    if (row.owner_id !== request.owner_id) {
      return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    }

    return reply.send(toPetState(row));
  });
}
