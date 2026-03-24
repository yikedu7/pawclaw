import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { registerOpenclawRoutes } from '../openclawRoutes.js';
import { social_events } from '../../db/schema.js';
import * as schema from '../../db/schema.js';
import type { WsEvent } from '@x-pet/shared';

const { Pool } = pg;

const OWNER = '00000000-eeee-4000-a000-000000000099';
const GATEWAY_TOKEN = 'gift-test-gateway-token';

let pool: InstanceType<typeof Pool>;
let db: ReturnType<typeof drizzle<typeof schema>>;
let fromPetId: string;
let targetPetId: string;
let app: FastifyInstance;
const emitted: WsEvent[] = [];

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');
  pool = new Pool({ connectionString: url });
  db = drizzle(pool, { schema });
  await pool.query('SELECT 1');

  // Seed auth user (FK required by pets.owner_id)
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'gift-test@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER]);

  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, gateway_token)
    VALUES
      ($1, 'GiftFromPet', 'Generous.', '# tools', $2),
      ($1, 'GiftTargetPet', 'Receiver.', '# tools', NULL)
    RETURNING id
  `, [OWNER, GATEWAY_TOKEN]);
  fromPetId = rows[0].id;
  targetPetId = rows[1].id;

  app = Fastify({ logger: false });
  await registerOpenclawRoutes(app, {
    emitOwnerEvent: (_ownerId, event) => { emitted.push(event); },
    submitPaymentTx: async () => '0xdeadbeef',
  });
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);
  await pool.end();
  await app.close();
});

describe('POST /internal/runtime/events/:petId — gift event', () => {
  it('inserts a social_events row and emits WS event with tx_hash when provided', async () => {
    emitted.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/internal/runtime/events/${fromPetId}`,
      headers: { authorization: `Bearer ${GATEWAY_TOKEN}` },
      payload: {
        event_type: 'gift',
        target_pet_id: targetPetId,
        amount: '1000000000000000000',
        tx_hash: '0xabc123',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    // DB side effect: social_events row inserted
    const rows = await db
      .select()
      .from(social_events)
      .where(eq(social_events.from_pet_id, fromPetId));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows.find(r => (r.payload as { tx_hash?: string }).tx_hash === '0xabc123');
    expect(row).toBeDefined();
    expect(row!.type).toBe('gift');
    expect(row!.to_pet_id).toBe(targetPetId);
    expect(row!.payload).toMatchObject({
      amount: '1000000000000000000',
      token: 'OKB',
      tx_hash: '0xabc123',
    });

    // WS event carries correct tx_hash
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('social.gift');
    if (emitted[0].type === 'social.gift') {
      expect(emitted[0].data.from_pet_id).toBe(fromPetId);
      expect(emitted[0].data.to_pet_id).toBe(targetPetId);
      expect(emitted[0].data.tx_hash).toBe('0xabc123');
      expect(emitted[0].data.token).toBe('OKB');
      expect(emitted[0].data.amount).toBe('1000000000000000000');
    }
  });

  it('falls back to empty string tx_hash when omitted', async () => {
    emitted.length = 0;

    const res = await app.inject({
      method: 'POST',
      url: `/internal/runtime/events/${fromPetId}`,
      headers: { authorization: `Bearer ${GATEWAY_TOKEN}` },
      payload: {
        event_type: 'gift',
        target_pet_id: targetPetId,
        amount: '500000000000000000',
      },
    });

    expect(res.statusCode).toBe(200);

    const rows = await db
      .select()
      .from(social_events)
      .where(eq(social_events.from_pet_id, fromPetId));
    const row = rows.find(r => (r.payload as { tx_hash?: string }).tx_hash === '');
    expect(row).toBeDefined();
    expect(row!.payload).toMatchObject({ tx_hash: '' });

    expect(emitted).toHaveLength(1);
    if (emitted[0].type === 'social.gift') {
      expect(emitted[0].data.tx_hash).toBe('');
    }
  });

  it('returns 401 with wrong gateway_token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/runtime/events/${fromPetId}`,
      headers: { authorization: 'Bearer wrong-token' },
      payload: {
        event_type: 'gift',
        target_pet_id: targetPetId,
        amount: '1000000000000000000',
        tx_hash: '0xabc',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when gift payload is missing amount', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/runtime/events/${fromPetId}`,
      headers: { authorization: `Bearer ${GATEWAY_TOKEN}` },
      payload: {
        event_type: 'gift',
        target_pet_id: targetPetId,
        // missing amount
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
