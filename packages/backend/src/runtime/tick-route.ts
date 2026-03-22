import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { executeTick } from './mock-tick.js';

const ParamsSchema = z.object({ petId: z.string().uuid() });

export async function registerTickRoute(fastify: FastifyInstance) {
  fastify.post<{
    Params: { petId: string };
    Body: { trigger?: 'manual' | 'cron' } | undefined;
  }>('/internal/tick/:petId', async (request, reply) => {
    const parsed = ParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'Invalid petId: must be a UUID' });
    }
    const { petId } = parsed.data;
    try {
      const result = await executeTick(petId);
      return reply.send({ ok: true, action: result.action });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      request.log.error({ err, petId }, 'Tick failed');
      return reply.status(500).send({ ok: false, error: message });
    }
  });
}
