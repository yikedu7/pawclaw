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
import jwt from 'jsonwebtoken';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerPetRoutes } from '../petRoutes.js';

// Mock credits — not under test here
vi.mock('../../onchain/credits.js', () => ({
  grantRegistrationCredits: vi.fn<(wallet: string) => Promise<void>>().mockResolvedValue(undefined),
}));

const { Pool } = pg;

const SECRET = 'tint-test-secret';
const OWNER = '00000000-cccc-4000-a000-000000000011';

function makeToken(sub: string): string {
  return jwt.sign({ sub }, SECRET);
}

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Seed auth.users row for FK constraint
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'tint-owner@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER]);

  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);

  process.env.JWT_SECRET = SECRET;
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
});

describe('tint_color integration', () => {
  let petId: string;

  it('POST /api/pets with tint_color stores and returns the color', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER)}` },
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
      headers: { authorization: `Bearer ${makeToken(OWNER)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tint_color).toBe('#ddccff');
  });

  it('POST /api/pets defaults tint_color to #ffffff when omitted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER)}` },
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
      headers: { authorization: `Bearer ${makeToken(OWNER)}` },
      payload: { name: 'BadPet', soul_prompt: 'a broken pet', tint_color: 'notacolor' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/pets returns tint_color for each pet in list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ tint_color?: string }>;
    expect(body.length).toBeGreaterThanOrEqual(1);
    for (const pet of body) {
      expect(pet).toHaveProperty('tint_color');
    }
  });
});
