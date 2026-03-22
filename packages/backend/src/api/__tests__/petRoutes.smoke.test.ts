import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerPetRoutes } from '../petRoutes.js';

const { Pool } = pg;

const SECRET = 'smoke-test-secret';
const OWNER_A = '00000000-aaaa-4000-a000-000000000001';
const OWNER_B = '00000000-aaaa-4000-a000-000000000002';

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

  // Seed auth.users rows for FK constraints
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES
      ($1, 'owner-a@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', ''),
      ($2, 'owner-b@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_A, OWNER_B]);

  // Clean pets from previous runs
  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);

  process.env.JWT_SECRET = SECRET;
  app = Fastify();
  await registerPetRoutes(app, {
    generateSoulMd: () => '# SOUL smoke',
    generateSkillMd: () => '# SKILL smoke',
  });
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);
  await pool.end();
  await app.close();
});

describe('pet CRUD integration', () => {
  it('POST /api/pets returns 401 without token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      payload: { name: 'X', soul_prompt: 'a cat' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('POST /api/pets returns 401 with invalid token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: 'Bearer garbage' },
      payload: { name: 'X', soul_prompt: 'a cat' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/pets returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
      payload: { soul_prompt: 'a curious cat' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/pets returns 400 when soul_prompt is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
      payload: { name: 'Mochi' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  let createdPetId: string;

  it('POST /api/pets returns 201 with correct response shape', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
      payload: { name: 'SmokePet', soul_prompt: 'a friendly dog' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('SmokePet');
    expect(body.hunger).toBe(100);
    expect(body.mood).toBe(100);
    expect(body.affection).toBe(0);
    expect(body).not.toHaveProperty('owner_id');
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('wallet_address');
    createdPetId = body.id;
  });

  it('DB side effect: inserted pet is queryable after POST', async () => {
    const { rows } = await pool.query('SELECT * FROM pets WHERE id = $1', [createdPetId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('SmokePet');
    expect(rows[0].owner_id).toBe(OWNER_A);
    expect(rows[0].soul_md).toBe('# SOUL smoke');
    expect(rows[0].skill_md).toBe('# SKILL smoke');
  });

  it('GET /api/pets/:id returns 200 with owner_id for owner', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/pets/${createdPetId}`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(createdPetId);
    expect(body.owner_id).toBe(OWNER_A);
    expect(body.name).toBe('SmokePet');
  });

  it('GET /api/pets/:id returns 404 for non-existent pet', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/pets/00000000-0000-4000-b000-999999999999',
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('GET /api/pets/:id returns 403 for wrong owner', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/pets/${createdPetId}`,
      headers: { authorization: `Bearer ${makeToken(OWNER_B)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('GET /api/pets returns only pets for the authenticated owner', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    for (const pet of body) {
      expect(pet).not.toHaveProperty('owner_id');
    }
  });
});
