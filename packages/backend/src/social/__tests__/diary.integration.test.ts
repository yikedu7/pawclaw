import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerDiaryRoute } from '../diary.js';

const { Pool } = pg;

const SECRET = 'diary-test-secret';
const OWNER_A = '00000000-dddd-4000-a000-000000000001';
const OWNER_B = '00000000-dddd-4000-a000-000000000002';

function makeToken(sub: string): string {
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

  // Seed auth.users rows
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES
      ($1, 'diary-a@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', ''),
      ($2, 'diary-b@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_A, OWNER_B]);

  // Seed a pet for OWNER_A
  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md)
    VALUES ($1, 'DiaryPet', 'You are a curious rabbit who loves adventures.', '# tools')
    RETURNING id
  `, [OWNER_A]);
  petId = rows[0].id;

  process.env.JWT_SECRET = SECRET;
  app = Fastify();
  await registerDiaryRoute(app);
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);
  await pool.end();
  await app.close();
});

describe('GET /api/pets/:id/diary', () => {
  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/pets/${petId}/diary` });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('returns 400 for non-UUID pet id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pets/not-a-uuid/diary',
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent pet', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pets/00000000-dead-4000-beef-000000000000/diary',
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('returns 403 for wrong owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/pets/${petId}/diary`,
      headers: { authorization: `Bearer ${makeToken(OWNER_B)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('returns 200 with static message when no social events exist', async () => {
    // No social_events seeded for this pet yet
    const res = await app.inject({
      method: 'GET',
      url: `/api/pets/${petId}/diary`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('diary');
    expect(typeof body.diary).toBe('string');
    expect(body.diary).toContain('DiaryPet');
  });

  it('returns 200 with LLM diary when social events exist (requires ANTHROPIC_API_KEY)', async () => {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-placeholder')) {
      process.stdout.write('Skipping LLM diary test — no real ANTHROPIC_API_KEY set\n');
      return;
    }

    // Seed a visit event for this pet
    await pool.query(`
      INSERT INTO social_events (from_pet_id, to_pet_id, type, payload)
      VALUES ($1, $1, 'visit', $2::jsonb)
    `, [petId, JSON.stringify({ turns: [{ speaker_pet_id: petId, line: 'Hello!' }] })]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/pets/${petId}/diary`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('diary');
    expect(typeof body.diary).toBe('string');
    expect(body.diary.length).toBeGreaterThan(10);
  });
});
