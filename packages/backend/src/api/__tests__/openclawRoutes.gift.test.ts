import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { registerOpenclawRoutes } from '../openclawRoutes.js';
import { pets, social_events } from '../../db/schema.js';
import * as schema from '../../db/schema.js';
import type { WsEvent } from '@x-pet/shared';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let db: ReturnType<typeof drizzle<typeof schema>>;

const TEST_OWNER = '00000000-0000-4000-a000-000000000099';
const GATEWAY_TOKEN = 'test-gateway-token';

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');
  pool = new Pool({ connectionString: url });
  db = drizzle(pool, { schema });
  await pool.query('SELECT 1');
});

afterAll(async () => {
  await pool.end();
});

async function buildApp(emittedEvents: WsEvent[] = []) {
  const app = Fastify({ logger: false });
  await registerOpenclawRoutes(app, {
    emitOwnerEvent: (_ownerId, event) => { emittedEvents.push(event); },
    submitPaymentTx: async () => '0xdeadbeef',
  });
  return app;
}

async function createTestPet() {
  const [pet] = await db.insert(pets).values({
    owner_id: TEST_OWNER,
    name: 'GiftTestPet',
    soul_md: 'Generous.',
    skill_md: 'Gives gifts.',
    gateway_token: GATEWAY_TOKEN,
  }).returning();
  return pet;
}

async function createTargetPet() {
  const [pet] = await db.insert(pets).values({
    owner_id: TEST_OWNER,
    name: 'GiftTargetPet',
    soul_md: 'Receiver.',
    skill_md: 'Accepts gifts.',
  }).returning();
  return pet;
}

describe('POST /internal/runtime/events/:petId — gift event', () => {
  it('inserts a social_events row and emits WS event with tx_hash when provided', async () => {
    const [fromPet, targetPet] = await Promise.all([createTestPet(), createTargetPet()]);
    const emitted: WsEvent[] = [];
    const app = await buildApp(emitted);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/runtime/events/${fromPet.id}`,
      headers: { authorization: `Bearer ${GATEWAY_TOKEN}` },
      payload: {
        event_type: 'gift',
        target_pet_id: targetPet.id,
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
      .where(eq(social_events.from_pet_id, fromPet.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('gift');
    expect(rows[0].to_pet_id).toBe(targetPet.id);
    expect(rows[0].payload).toMatchObject({
      amount: '1000000000000000000',
      token: 'OKB',
      tx_hash: '0xabc123',
    });

    // WS event emitted with correct tx_hash
    expect(emitted).toHaveLength(1);
    const wsEvent = emitted[0];
    expect(wsEvent.type).toBe('social.gift');
    if (wsEvent.type === 'social.gift') {
      expect(wsEvent.data.from_pet_id).toBe(fromPet.id);
      expect(wsEvent.data.to_pet_id).toBe(targetPet.id);
      expect(wsEvent.data.tx_hash).toBe('0xabc123');
      expect(wsEvent.data.token).toBe('OKB');
      expect(wsEvent.data.amount).toBe('1000000000000000000');
    }
  });

  it('falls back to empty string tx_hash when omitted', async () => {
    const [fromPet, targetPet] = await Promise.all([createTestPet(), createTargetPet()]);
    const emitted: WsEvent[] = [];
    const app = await buildApp(emitted);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/runtime/events/${fromPet.id}`,
      headers: { authorization: `Bearer ${GATEWAY_TOKEN}` },
      payload: {
        event_type: 'gift',
        target_pet_id: targetPet.id,
        amount: '500000000000000000',
      },
    });

    expect(res.statusCode).toBe(200);

    const rows = await db
      .select()
      .from(social_events)
      .where(eq(social_events.from_pet_id, fromPet.id));
    expect(rows).toHaveLength(1);
    expect((rows[0].payload as { tx_hash: string }).tx_hash).toBe('');

    expect(emitted).toHaveLength(1);
    if (emitted[0].type === 'social.gift') {
      expect(emitted[0].data.tx_hash).toBe('');
    }
  });

  it('returns 401 with wrong gateway_token', async () => {
    const fromPet = await createTestPet();
    const targetPet = await createTargetPet();
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/internal/runtime/events/${fromPet.id}`,
      headers: { authorization: 'Bearer wrong-token' },
      payload: {
        event_type: 'gift',
        target_pet_id: targetPet.id,
        amount: '1000000000000000000',
        tx_hash: '0xabc',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when gift payload is missing amount', async () => {
    const fromPet = await createTestPet();
    const targetPet = await createTargetPet();
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/internal/runtime/events/${fromPet.id}`,
      headers: { authorization: `Bearer ${GATEWAY_TOKEN}` },
      payload: {
        event_type: 'gift',
        target_pet_id: targetPet.id,
        // missing amount
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
