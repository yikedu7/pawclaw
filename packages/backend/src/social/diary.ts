import type { FastifyInstance } from 'fastify';
import { eq, or, desc } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { PetIdParamSchema } from '@x-pet/shared';
import { db } from '../db/client.js';
import { pets, social_events } from '../db/schema.js';
import { authHook } from '../api/authHook.js';

const anthropic = new Anthropic();

export async function registerDiaryRoute(fastify: FastifyInstance): Promise<void> {
  const auth = authHook(fastify);

  // GET /api/pets/:id/diary — generate a diary entry from recent social events
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

    // Fetch last 10 social events involving this pet (as initiator or recipient)
    const events = await db
      .select()
      .from(social_events)
      .where(
        or(
          eq(social_events.from_pet_id, parsed.data.id),
          eq(social_events.to_pet_id, parsed.data.id),
        ),
      )
      .orderBy(desc(social_events.created_at))
      .limit(10);

    if (events.length === 0) {
      return reply.send({ diary: `${petRow.name} had a quiet day with no notable events.` });
    }

    const eventLines = events
      .map((ev) => `[${ev.type}] at ${ev.created_at.toISOString()}: ${JSON.stringify(ev.payload)}`)
      .join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 512,
      system: petRow.soul_md,
      messages: [
        {
          role: 'user',
          content: `Write a short, first-person diary entry (2–4 sentences) summarising ${petRow.name}'s day based on these events:\n\n${eventLines}`,
        },
      ],
    });

    const diary =
      response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ??
      'Today was a normal day.';

    return reply.send({ diary });
  });
}
