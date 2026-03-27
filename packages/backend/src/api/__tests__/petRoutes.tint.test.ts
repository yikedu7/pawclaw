/**
 * Integration tests for tint_color field (issue #121).
 * Uses fastify.inject() against a real local Postgres DB (no mocking).
 *
 * Prerequisites:
 *   supabase start
 *   pnpm --filter @pawclaw/backend db:migrate
 *   supabase db reset
 */
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerPetRoutes } from '../petRoutes.js';
import { getTestToken, deleteTestUser } from './supabase-auth.js';

// Mock credits — not under test here
vi.mock('../../onchain/credits.js', () => ({
  grantDbCredits: vi.fn<(petId: string) => Promise<void>>().mockResolvedValue(undefined),
}));

const { Pool } = pg;

const OWNER = '00000000-cccc-4000-a000-000000000011';

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Get real Supabase JWT token (ES256) via admin API
  token = await getTestToken(OWNER, 'tint-owner@test.local');

  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);

  app = Fastify();
  await registerPetRoutes(app, {
    generateSoulMd: () => '# SOUL tint',
    generateSkillMd: () => '# SKILL tint',
  });
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);
  await pool.end();
  await app.close();
  await deleteTestUser(OWNER);
});

describe('tint_color integration', () => {
  let petId: string;

  it('POST /api/pets with tint_color stores and returns the color', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pets',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'TintPet', soul_prompt: 'a lavender cat', tint_color: '#ddccff' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.tint_color).toBe('#ddccff');
    expect(body.name).toBe('TintPet');
    petId = body.id;
  });

  it('DB side effect: tint_color is persisted correctly', async () => {
    const { rows } = await pool.query('SELECT tint_color FROM pets WHERE id = $1', [petId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].tint_color).toBe('#ddccff');
  });

  it('GET /api/pets/:id returns tint_color in response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/pets/${petId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tint_color).toBe('#ddccff');
  });

  it('POST /api/pets defaults tint_color to #ffffff when omitted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pets',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'WhitePet', soul_prompt: 'a plain dog' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.tint_color).toBe('#ffffff');
  });

  it('POST /api/pets returns 400 when tint_color is not a valid hex color', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pets',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'BadPet', soul_prompt: 'a broken pet', tint_color: 'notacolor' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/pets returns tint_color for each pet in list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pets',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ tint_color?: string }>;
    expect(body.length).toBeGreaterThanOrEqual(1);
    for (const pet of body) {
      expect(pet).toHaveProperty('tint_color');
    }
  });
});
