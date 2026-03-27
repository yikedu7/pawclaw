import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerChatRoute } from '../chatRoute.js';
import { getTestToken, deleteTestUser } from './supabase-auth.js';

const { Pool } = pg;

const OWNER_A = '00000000-cccc-4000-d000-000000000001';
const OWNER_B = '00000000-cccc-4000-d000-000000000002';

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let petId: string;
let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Get real Supabase JWT tokens (ES256) via admin API
  tokenA = await getTestToken(OWNER_A, 'chat-owner-a@test.local');
  tokenB = await getTestToken(OWNER_B, 'chat-owner-b@test.local');

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
  });
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);
  await pool.end();
  await app.close();
  await Promise.all([deleteTestUser(OWNER_A), deleteTestUser(OWNER_B)]);
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
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when message exceeds 500 chars', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/chat`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { message: 'x'.repeat(501) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for wrong owner', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/chat`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { message: 'hello' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent pet', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets/00000000-0000-4000-b000-999999999999/chat',
      headers: { authorization: `Bearer ${tokenA}` },
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
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { message: 'Hello, how are you?' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reply: expect.any(String) });
  });
});
