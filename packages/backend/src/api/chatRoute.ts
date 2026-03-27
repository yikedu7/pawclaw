import type { FastifyInstance } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WsEvent } from '@pawclaw/shared';
import { db } from '../db/client.js';
import { pets } from '../db/schema.js';
import { authHook } from './authHook.js';
import { stopContainer } from '../runtime/container.js';
import { tickBus } from '../runtime/tick-bus.js';

const CHAT_COST = 0.004;

const anthropic = new Anthropic();

const ChatBodySchema = z.object({
  message: z.string().min(1).max(500),
});

export type ChatRouteDeps = {
  emitOwnerEvent: (ownerId: string, event: WsEvent) => void;
  containerChat: (containerId: string, gatewayToken: string, message: string, state: object, ownerId?: string) => Promise<string>;
  containerChatStream: (containerId: string, gatewayToken: string, message: string, state: object, ownerId: string | undefined, onToken: (token: string) => void) => Promise<string>;
};

export async function registerChatRoute(fastify: FastifyInstance, deps: ChatRouteDeps): Promise<void> {
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

    const wantsStream = request.headers.accept?.includes('text/event-stream') ?? false;

    // ── SSE streaming path ──────────────────────────────────────────────────
    if (wantsStream && pet.container_id && pet.gateway_token && pet.container_status === 'running') {
      await reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
        // reply.hijack() bypasses Fastify's onSend hooks (including @fastify/cors),
        // so we must manually echo the CORS origin header.
        'Access-Control-Allow-Origin': request.headers.origin ?? '*',
      });

      try {
        const fullText = await deps.containerChatStream(
          pet.container_id,
          pet.gateway_token,
          parsed.data.message,
          { hunger: pet.hunger, mood: pet.mood, affection: pet.affection },
          request.owner_id,
          (token: string) => { raw.write(`data: ${token}\n\n`); },
        );
        raw.write('data: [DONE]\n\n');
        raw.end();
        // SSE client already received the full stream — no WS echo needed
      } catch (err: unknown) {
        request.log.error({ err, petId: id }, 'Container chat stream failed');
        raw.write('data: [ERROR]\n\n');
        raw.end();
      }
      return;
    }

    // ── Non-streaming path (unchanged) ──────────────────────────────────────
    if (pet.container_id && pet.gateway_token && pet.container_status === 'running') {
      try {
        const replyText = await deps.containerChat(
          pet.container_id,
          pet.gateway_token,
          parsed.data.message,
          { hunger: pet.hunger, mood: pet.mood, affection: pet.affection },
          request.owner_id,
        );
        deps.emitOwnerEvent(pet.owner_id, {
          type: 'pet.speak',
          data: { pet_id: id, message: replyText },
        });
        await deductChatCost(pet, request.log);
        return reply.send({ reply: replyText });
      } catch (err: unknown) {
        request.log.error({ err, petId: id }, 'Container chat failed');
        // fall through to direct LLM below
      }
    }

    // ── Direct LLM path — SSE streaming when requested ──────────────────────
    if (wantsStream) {
      await reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
        // reply.hijack() bypasses @fastify/cors onSend hooks — set CORS manually
        'Access-Control-Allow-Origin': request.headers.origin ?? '*',
      });

      try {
        if (process.env.MOCK_LLM === '1') {
          raw.write(`data: I heard you! (mock chat)\n\n`);
        } else {
          const stream = anthropic.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 256,
            system: pet.soul_md ?? undefined,
            messages: [{ role: 'user', content: parsed.data.message }],
          });
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta' &&
              event.delta.text
            ) {
              raw.write(`data: ${event.delta.text}\n\n`);
            }
          }
        }
        raw.write('data: [DONE]\n\n');
        raw.end();
        // SSE client already received the full stream — no WS echo needed
      } catch (err: unknown) {
        request.log.error({ err, petId: id }, 'Direct LLM stream failed');
        raw.write('data: [ERROR]\n\n');
        raw.end();
      }
      return;
    }

    // ── Direct LLM path — JSON ────────────────────────────────────────────────
    let reply_text: string;

    if (process.env.MOCK_LLM === '1') {
      reply_text = 'I heard you! (mock chat)';
    } else {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        system: pet.soul_md ?? undefined,
        messages: [{ role: 'user', content: parsed.data.message }],
      });
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      reply_text = textBlock?.text ?? '...';
    }

    deps.emitOwnerEvent(pet.owner_id, {
      type: 'pet.speak',
      data: { pet_id: id, message: reply_text },
    });

    await deductChatCost(pet, request.log);
    return reply.send({ reply: reply_text });
  });
}

async function deductChatCost(pet: { id: string; owner_id: string; system_credits: string | null; onchain_balance: string | null; initial_credits: string; mood: number; affection: number; hunger: number; container_id: string | null; container_status: string }, log: { error(obj: object, msg: string): void }): Promise<void> {
  try {
    const newSystemCredits = parseFloat(pet.system_credits ?? '0') - CHAT_COST;
    const onchainBalance = parseFloat(pet.onchain_balance ?? '0');
    const initialCredits = parseFloat(pet.initial_credits ?? '0.3');
    const total = newSystemCredits + onchainBalance;
    const hunger = Math.max(0, Math.min(100, Math.round((1 - total / initialCredits) * 100)));

    await db.update(pets).set({ system_credits: newSystemCredits.toString(), hunger }).where(eq(pets.id, pet.id));

    if (total <= 0) {
      if (pet.container_id && pet.container_status === 'running') {
        await stopContainer(pet.container_id).catch(() => {});
      }
      tickBus.emit('ownerEvent', pet.owner_id, { type: 'pet.died', data: { pet_id: pet.id } });
    } else {
      tickBus.emit('ownerEvent', pet.owner_id, { type: 'pet.state', data: { pet_id: pet.id, hunger, mood: pet.mood, affection: pet.affection } });
    }
  } catch (err) {
    log.error({ err, petId: pet.id }, '[chat] Failed to deduct CHAT_COST');
  }
}
