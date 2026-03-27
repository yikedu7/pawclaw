import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerChatRoute } from '../chatRoute.js';

// Mock authHook — chat tests cover business logic, not authentication.
vi.mock('../authHook.js', () => ({
  authHook: () => async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? '';
    if (!header.startsWith('Bearer fake:')) {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }
    request.owner_id = header.slice('Bearer fake:'.length);
  },
}));

const { Pool } = pg;

const OWNER_A = '00000000-cccc-4000-d000-000000000001';
const OWNER_B = '00000000-cccc-4000-d000-000000000002';

function makeToken(sub: string) {
  return `fake:${sub}`;
}

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let petId: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES
      ($1, 'chat-owner-a@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', ''),
      ($2, 'chat-owner-b@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_A, OWNER_B]);

  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md)
    VALUES ($1, 'ChatPet', 'You are a cheerful cat.', '# tools')
    RETURNING id
  `, [OWNER_A]);
  petId = rows[0].id;

  app = Fastify();
  await registerChatRoute(app, {
    emitOwnerEvent: () => {},
    containerChat: async () => { throw new Error('no container in tests'); },
    containerChatStream: async (_cid, _tok, _msg, _state, _owner, onToken) => {
      onToken('Hello');
      onToken(' world!');
      return 'Hello world!';
    },
  });
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);
  await pool.end();
  await app.close();
});

describe('POST /api/pets/:id/chat', () => {
  it('returns 401 without token', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/chat`,
      payload: { message: 'hello' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when message is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/chat`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when message exceeds 500 chars', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/chat`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
      payload: { message: 'x'.repeat(501) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for wrong owner', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/chat`,
      headers: { authorization: `Bearer ${makeToken(OWNER_B)}` },
      payload: { message: 'hello' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent pet', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets/00000000-0000-4000-b000-999999999999/chat',
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
      payload: { message: 'hello' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('returns 200 with reply (requires ANTHROPIC_API_KEY)', async () => {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-placeholder')) {
      process.stdout.write('Skipping LLM chat test — no real ANTHROPIC_API_KEY set\n');
      return;
    }
    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/chat`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
      payload: { message: 'Hello, how are you?' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reply: expect.any(String) });
  });

  it('returns SSE stream when no container and Accept: text/event-stream', async () => {
    // Pet has no container — direct LLM path also streams when SSE is requested
    const prev = process.env.MOCK_LLM;
    process.env.MOCK_LLM = '1';
    try {
      const res = await app.inject({
        method: 'POST', url: `/api/pets/${petId}/chat`,
        headers: {
          authorization: `Bearer ${makeToken(OWNER_A)}`,
          accept: 'text/event-stream',
        },
        payload: { message: 'ping' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      expect(res.body).toContain('data: ');
      expect(res.body).toContain('data: [DONE]\n\n');
    } finally {
      if (prev === undefined) delete process.env.MOCK_LLM;
      else process.env.MOCK_LLM = prev;
    }
  });
});

describe('POST /api/pets/:id/chat — SSE streaming', () => {
  let streamPetId: string;
  let streamApp: FastifyInstance;
  let streamPool: InstanceType<typeof Pool>;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');

    streamPool = new Pool({ connectionString: url });

    await streamPool.query(`
      INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
      VALUES ($1, 'chat-stream@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
      ON CONFLICT (id) DO NOTHING
    `, [OWNER_A]);

    const { rows } = await streamPool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md, container_id, gateway_token, container_status)
      VALUES ($1, 'StreamPet', 'You are a cat.', '# tools', 'fake-container', 'fake-token', 'running')
      RETURNING id
    `, [OWNER_A]);
    streamPetId = rows[0].id;

    streamApp = Fastify();
    await registerChatRoute(streamApp, {
      emitOwnerEvent: () => {},
      containerChat: async () => { throw new Error('should not be called'); },
      containerChatStream: async (_cid, _tok, _msg, _state, _owner, onToken) => {
        onToken('Hello');
        onToken(' world!');
        return 'Hello world!';
      },
    });
    await streamApp.ready();
  });

  afterAll(async () => {
    await streamPool.query('DELETE FROM pets WHERE id = $1', [streamPetId]);
    await streamPool.end();
    await streamApp.close();
  });

  it('returns text/event-stream with SSE chunks when container is running', async () => {
    const res = await streamApp.inject({
      method: 'POST', url: `/api/pets/${streamPetId}/chat`,
      headers: {
        authorization: `Bearer ${makeToken(OWNER_A)}`,
        accept: 'text/event-stream',
      },
      payload: { message: 'hi' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const body = res.body;
    expect(body).toContain('data: Hello\n\n');
    expect(body).toContain('data:  world!\n\n');
    expect(body).toContain('data: [DONE]\n\n');
  });

  it('deducts system_credits after SSE streaming chat succeeds', async () => {
    // Use a dedicated pet to avoid races with other SSE tests running on streamPetId
    const { rows: petRows } = await streamPool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md, container_id, gateway_token, container_status, system_credits, initial_credits)
      VALUES ($1, 'CreditPet', 'You are a cat.', '# tools', 'fake-container-credit', 'fake-token-credit', 'running', '1.000', '1.000')
      RETURNING id
    `, [OWNER_A]);
    const creditPetId = petRows[0].id;

    try {
      const res = await streamApp.inject({
        method: 'POST', url: `/api/pets/${creditPetId}/chat`,
        headers: {
          authorization: `Bearer ${makeToken(OWNER_A)}`,
          accept: 'text/event-stream',
        },
        payload: { message: 'deduct test' },
      });
      expect(res.statusCode).toBe(200);

      const { rows } = await streamPool.query<{ system_credits: string }>(
        'SELECT system_credits FROM pets WHERE id = $1',
        [creditPetId],
      );
      const after = parseFloat(rows[0].system_credits);
      expect(after).toBeCloseTo(1.000 - 0.004, 5);
    } finally {
      await streamPool.query('DELETE FROM pets WHERE id = $1', [creditPetId]);
    }
  });
});
