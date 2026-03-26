/**
 * Integration tests for:
 *   1. grantDbCredits — registration sets paw_balance = initial_credits
 *   2. POST /internal/heartbeat/:petId/deduct — decrements paw_balance
 *   3. pet.died event — fired when paw_balance reaches 0
 *
 * Requires a real Supabase local DB:
 *   supabase start && supabase db reset
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerOpenclawRoutes } from '../openclawRoutes.js';
import { grantDbCredits } from '../../onchain/credits.js';
import type { WsEvent } from '@pawclaw/shared';

const { Pool } = pg;

const OWNER = '00000000-dddd-4003-a000-000000000099';
const GATEWAY_TOKEN = 'deduct-test-gateway-token';

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let petId: string;
const emittedEvents: WsEvent[] = [];

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Seed auth user
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'deduct-test@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER]);

  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, gateway_token, paw_balance)
    VALUES ($1, 'DeductPet', '# soul', '# skill', $2, NULL)
    RETURNING id
  `, [OWNER, GATEWAY_TOKEN]);
  petId = rows[0].id;

  app = Fastify({ logger: false });
  await registerOpenclawRoutes(app, {
    emitOwnerEvent: (ownerId, event) => { emittedEvents.push(event); },
  });
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);
  await pool.end();
  await app.close();
});

const authHeader = { authorization: `Bearer ${GATEWAY_TOKEN}` };

describe('grantDbCredits', () => {
  it('sets paw_balance = initial_credits in the DB', async () => {
    await grantDbCredits(petId);

    const { rows } = await pool.query<{ paw_balance: string; initial_credits: number }>(
      'SELECT paw_balance, initial_credits FROM pets WHERE id = $1',
      [petId],
    );
    expect(rows).toHaveLength(1);
    expect(parseFloat(rows[0].paw_balance)).toBe(rows[0].initial_credits);
  });
});

describe('POST /internal/heartbeat/:petId/deduct', () => {
  beforeAll(async () => {
    // Set a known paw_balance before deduct tests
    await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['1.0', petId]);
  });

  it('returns 404 for unknown petId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/heartbeat/00000000-0000-4000-b000-999999999999/deduct',
      headers: authHeader,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('returns 401 for wrong gateway_token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/heartbeat/${petId}/deduct`,
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('returns 200 and decrements paw_balance by HEARTBEAT_COST', async () => {
    await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['10.0', petId]);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/heartbeat/${petId}/deduct`,
      headers: authHeader,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });

    const { rows } = await pool.query<{ paw_balance: string }>(
      'SELECT paw_balance FROM pets WHERE id = $1',
      [petId],
    );
    expect(parseFloat(rows[0].paw_balance)).toBeCloseTo(10.0 - 0.000001, 6);
  });

  it('does not emit pet.died when balance remains positive', async () => {
    await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['10.0', petId]);
    emittedEvents.length = 0;

    await app.inject({
      method: 'POST',
      url: `/internal/heartbeat/${petId}/deduct`,
      headers: authHeader,
    });

    expect(emittedEvents.find((e) => e.type === 'pet.died')).toBeUndefined();
  });

  it('emits pet.died when paw_balance reaches 0', async () => {
    // Set balance to exactly HEARTBEAT_COST so one deduct zeroes it
    await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['0.000001', petId]);
    emittedEvents.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/internal/heartbeat/${petId}/deduct`,
      headers: authHeader,
    });

    expect(res.statusCode).toBe(200);

    const diedEvent = emittedEvents.find((e) => e.type === 'pet.died');
    expect(diedEvent).toBeDefined();
    expect(diedEvent).toMatchObject({ type: 'pet.died', data: { pet_id: petId } });
  });

  it('emits pet.died when paw_balance goes below 0', async () => {
    // Set balance below HEARTBEAT_COST so the result is negative
    await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['0.0000005', petId]);
    emittedEvents.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/internal/heartbeat/${petId}/deduct`,
      headers: authHeader,
    });

    expect(res.statusCode).toBe(200);

    const diedEvent = emittedEvents.find((e) => e.type === 'pet.died');
    expect(diedEvent).toBeDefined();
    expect(diedEvent).toMatchObject({ type: 'pet.died', data: { pet_id: petId } });
  });
});
