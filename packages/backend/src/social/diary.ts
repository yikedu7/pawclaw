import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { PetIdParamSchema } from '@pawclaw/shared';
import { db } from '../db/client.js';
import { pets, diary_entries } from '../db/schema.js';
import { authHook } from '../api/authHook.js';

export async function registerDiaryRoute(fastify: FastifyInstance): Promise<void> {
  const auth = authHook(fastify);

  // GET /api/pets/:id/diary — return latest diary entry from table
  fastify.get('/api/pets/:id/diary', { preHandler: auth }, async (request, reply) => {
    const parsed = PetIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid pet id', code: 'VALIDATION_ERROR' });
    }

    const petRow = await db.query.pets.findFirst({ where: eq(pets.id, parsed.data.id) });
    if (!petRow) {
      return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    }
    if (petRow.owner_id !== request.owner_id) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    const [entry] = await db
      .select()
      .from(diary_entries)
      .where(eq(diary_entries.pet_id, parsed.data.id))
      .orderBy(desc(diary_entries.created_at))
      .limit(1);

    if (!entry) {
      return reply.send({ diary: null });
    }

    return reply.send({ diary: entry.content, created_at: entry.created_at });
  });
}
