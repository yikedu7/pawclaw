import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerOpenclawRoutes } from '../openclawRoutes.js';

const { Pool } = pg;

const WEBHOOK_TOKEN = 'test-openclaw-secret';
const OWNER_A = '00000000-eeee-4000-d000-000000000001';
const OWNER_B = '00000000-eeee-4000-d000-000000000002';

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let petId: string;
let otherPetId: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Seed auth users
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES
      ($1, 'oc-owner-a@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', ''),
      ($2, 'oc-owner-b@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_A, OWNER_B]);

  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, gateway_token)
    VALUES
      ($1, 'OcPetA', 'You are a curious dog.', '# tools', 'pet-a-gateway-token'),
      ($2, 'OcPetB', 'You are a lazy cat.', '# tools', 'pet-b-gateway-token')
    RETURNING id
  `, [OWNER_A, OWNER_B]);
  petId = rows[0].id;
  otherPetId = rows[1].id;

  process.env.OPENCLAW_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
  app = Fastify();
  await registerOpenclawRoutes(app, { emitOwnerEvent: () => {} });
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);
  await pool.end();
  await app.close();
  delete process.env.OPENCLAW_WEBHOOK_TOKEN;
});

// ── Auth validation ──────────────────────────────────────────────────────────

describe('Bearer token auth — /internal/tools/* (OPENCLAW_WEBHOOK_TOKEN)', () => {
  const toolEndpoints = [
    { method: 'POST' as const, url: '/internal/tools/speak' },
    { method: 'POST' as const, url: '/internal/tools/visit_pet' },
    { method: 'POST' as const, url: '/internal/tools/rest' },
    { method: 'POST' as const, url: '/internal/tools/send_gift' },
  ];

  for (const { method, url } of toolEndpoints) {
    it(`returns 401 with no token on ${url}`, async () => {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('UNAUTHORIZED');
    });

    it(`returns 401 with wrong token on ${url}`, async () => {
      const res = await app.inject({
        method, url,
        headers: { authorization: 'Bearer wrong-token' },
        payload: {},
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('UNAUTHORIZED');
    });
  }
});

describe('Bearer token auth — /internal/runtime/events/:petId (per-pet gateway_token)', () => {
  it('returns 401 with no token', async () => {
    const res = await app.inject({
      method: 'POST', url: `/internal/runtime/events/${petId}`,
      payload: { event_type: 'speak', message: 'hi' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with wrong token', async () => {
    const res = await app.inject({
      method: 'POST', url: `/internal/runtime/events/${petId}`,
      headers: { authorization: 'Bearer wrong-token' },
      payload: { event_type: 'speak', message: 'hi' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('returns 200 with correct gateway_token', async () => {
    const res = await app.inject({
      method: 'POST', url: `/internal/runtime/events/${petId}`,
      headers: { authorization: 'Bearer pet-a-gateway-token' },
      payload: { event_type: 'speak', message: 'Woof!' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });
});

// ── POST /internal/runtime/events/:petId ─────────────────────────────────────

describe('POST /internal/runtime/events/:petId', () => {
  const auth = { authorization: 'Bearer pet-a-gateway-token' };

  it('returns 400 on invalid petId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/internal/runtime/events/not-a-uuid',
      headers: auth,
      payload: { event_type: 'speak', message: 'hi' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 on unknown event_type', async () => {
    const res = await app.inject({
      method: 'POST', url: `/internal/runtime/events/${petId}`,
      headers: auth,
      payload: { event_type: 'unknown' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for non-existent petId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/internal/runtime/events/00000000-0000-4000-b000-999999999999',
      headers: auth,
      payload: { event_type: 'speak', message: 'hi' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('handles rest event — updates hunger/mood in DB', async () => {
    // Set known baseline
    await pool.query('UPDATE pets SET hunger = 50, mood = 50 WHERE id = $1', [petId]);

    const res = await app.inject({
      method: 'POST', url: `/internal/runtime/events/${petId}`,
      headers: auth,
      payload: { event_type: 'rest' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });

    const { rows } = await pool.query<{ hunger: number; mood: number }>(
      'SELECT hunger, mood FROM pets WHERE id = $1', [petId],
    );
    expect(rows[0].hunger).toBe(60);
    expect(rows[0].mood).toBe(55);
  });

  it('handles state_update event — updates specific fields', async () => {
    await pool.query('UPDATE pets SET hunger = 80, mood = 80 WHERE id = $1', [petId]);

    const res = await app.inject({
      method: 'POST', url: `/internal/runtime/events/${petId}`,
      headers: auth,
      payload: { event_type: 'state_update', hunger: 40 },
    });
    expect(res.statusCode).toBe(200);
    const { rows } = await pool.query<{ hunger: number; mood: number }>(
      'SELECT hunger, mood FROM pets WHERE id = $1', [petId],
    );
    expect(rows[0].hunger).toBe(40);
    expect(rows[0].mood).toBe(80); // unchanged
  });

  it('handles gift event — returns ok:true (TODO #16 stub)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/internal/runtime/events/${petId}`,
      headers: auth,
      payload: { event_type: 'gift', target_pet_id: otherPetId, amount: '0.001' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });
});

// ── POST /internal/tools/speak ────────────────────────────────────────────────

describe('POST /internal/tools/speak', () => {
  const auth = { authorization: `Bearer ${WEBHOOK_TOKEN}` };

  it('returns 400 when pet_id missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/internal/tools/speak',
      headers: auth,
      payload: { message: 'hi' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 200 with ok:true', async () => {
    const res = await app.inject({
      method: 'POST', url: '/internal/tools/speak',
      headers: auth,
      payload: { pet_id: petId, message: 'Hello world' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });
});

// ── POST /internal/tools/rest ─────────────────────────────────────────────────

describe('POST /internal/tools/rest', () => {
  const auth = { authorization: `Bearer ${WEBHOOK_TOKEN}` };

  it('returns 200 and updates hunger/mood', async () => {
    await pool.query('UPDATE pets SET hunger = 60, mood = 60 WHERE id = $1', [petId]);

    const res = await app.inject({
      method: 'POST', url: '/internal/tools/rest',
      headers: auth,
      payload: { pet_id: petId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });

    const { rows } = await pool.query<{ hunger: number; mood: number }>(
      'SELECT hunger, mood FROM pets WHERE id = $1', [petId],
    );
    expect(rows[0].hunger).toBe(70);
    expect(rows[0].mood).toBe(65);
  });
});

// ── POST /internal/tools/send_gift ───────────────────────────────────────────

describe('POST /internal/tools/send_gift', () => {
  const auth = { authorization: `Bearer ${WEBHOOK_TOKEN}` };

  it('returns 200 with ok:true (TODO #16 stub)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/internal/tools/send_gift',
      headers: auth,
      payload: { pet_id: petId, target_pet_id: otherPetId, amount: '0.01' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('returns 400 when amount missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/internal/tools/send_gift',
      headers: auth,
      payload: { pet_id: petId, target_pet_id: otherPetId },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
