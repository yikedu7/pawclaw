import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerChatRoute } from '../chatRoute.js';

const { Pool } = pg;

const SECRET = 'smoke-test-secret';
const OWNER_A = '00000000-cccc-4000-d000-000000000001';
const OWNER_B = '00000000-cccc-4000-d000-000000000002';

function makeToken(sub: string) {
  return jwt.sign({ sub }, SECRET);
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

  process.env.JWT_SECRET = SECRET;
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
});
