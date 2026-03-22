import type { FastifyInstance } from 'fastify';
import { executeTick } from './mock-tick.js';

export async function registerTickRoute(fastify: FastifyInstance) {
  fastify.post<{
    Params: { petId: string };
    Body: { trigger?: 'manual' | 'cron' } | undefined;
  }>('/internal/tick/:petId', async (request, reply) => {
    const { petId } = request.params;
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
