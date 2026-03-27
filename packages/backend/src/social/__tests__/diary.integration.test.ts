import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerDiaryRoute } from '../diary.js';
import { getTestToken, deleteTestUser } from '../../api/__tests__/supabase-auth.js';

const { Pool } = pg;

const OWNER_A = '00000000-dddd-4000-a000-000000000001';
const OWNER_B = '00000000-dddd-4000-a000-000000000002';

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
  tokenA = await getTestToken(OWNER_A, 'diary-a@test.local');
  tokenB = await getTestToken(OWNER_B, 'diary-b@test.local');

  // Seed a pet for OWNER_A
  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md)
    VALUES ($1, 'DiaryPet', 'You are a curious rabbit who loves adventures.', '# tools')
    RETURNING id
  `, [OWNER_A]);
  petId = rows[0].id;

  app = Fastify();
  await registerDiaryRoute(app);
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM diary_entries WHERE pet_id = $1', [petId]);
  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);
  await pool.end();
  await app.close();
  await Promise.all([deleteTestUser(OWNER_A), deleteTestUser(OWNER_B)]);
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
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent pet', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pets/00000000-dead-4000-beef-000000000000/diary',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('returns 403 for wrong owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/pets/${petId}/diary`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('returns { diary: null } when no diary entries exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/pets/${petId}/diary`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ diary: null });
  });

  it('returns latest diary entry when one exists', async () => {
    await pool.query(
      `INSERT INTO diary_entries (pet_id, content) VALUES ($1, 'Today I visited my friend.')`,
      [petId],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/pets/${petId}/diary`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.diary).toBe('Today I visited my friend.');
    expect(body.created_at).toBeDefined();
  });

  it('returns the latest entry when multiple entries exist', async () => {
    await pool.query(
      `INSERT INTO diary_entries (pet_id, content, created_at) VALUES ($1, 'Older entry.', now() - interval '1 day')`,
      [petId],
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/pets/${petId}/diary`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().diary).toBe('Today I visited my friend.');
  });
});
