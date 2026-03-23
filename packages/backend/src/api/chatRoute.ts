import type { FastifyInstance } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { pets } from '../db/schema.js';
import { tickBus } from '../runtime/tick-bus.js';
import { authHook } from './authHook.js';

const anthropic = new Anthropic();

const ChatBodySchema = z.object({
  message: z.string().min(1).max(500),
});

export async function registerChatRoute(fastify: FastifyInstance): Promise<void> {
  const auth = authHook(fastify);

  fastify.post('/api/pets/:id/chat', { preHandler: auth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = ChatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues.map((i) => i.message).join(', '),
        code: 'VALIDATION_ERROR',
      });
    }

    const pet = await db.query.pets.findFirst({ where: eq(pets.id, id) });
    if (!pet) {
      return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    }
    if (pet.owner_id !== request.owner_id) {
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    let reply_text: string;

    if (process.env.MOCK_LLM === '1') {
      reply_text = `${pet.name} says: I heard you! (mock chat)`;
    } else {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 256,
        system: pet.soul_md,
        messages: [{ role: 'user', content: parsed.data.message }],
      });
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      reply_text = textBlock?.text ?? '...';
    }

    tickBus.emit('ownerEvent', pet.owner_id, {
      type: 'pet.speak',
      data: { pet_id: id, message: reply_text },
    });

    return reply.send({ reply: reply_text });
  });
}
