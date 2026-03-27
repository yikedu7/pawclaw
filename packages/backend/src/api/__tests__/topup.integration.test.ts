import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerPetRoutes } from '../petRoutes.js';

// Mock authHook — topup tests cover DB side-effects and on-chain balance polling,
// not authentication.
vi.mock('../authHook.js', () => ({
  authHook: () => async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? '';
    if (!header.startsWith('Bearer fake:')) {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }
    request.owner_id = header.slice('Bearer fake:'.length);
  },
}));

// vi.hoisted ensures this fn is initialised before vi.mock hoisting
const mockGetPawBalance = vi.hoisted(() => vi.fn<() => Promise<string>>());

// Mock getPawBalance — real on-chain RPC not available in integration tests
vi.mock('../../onchain/balance.js', () => ({
  getPawBalance: mockGetPawBalance,
}));

// Mock grantDbCredits — not relevant for topup tests
vi.mock('../../onchain/credits.js', () => ({
  grantDbCredits: vi.fn().mockResolvedValue(undefined),
}));

const { Pool } = pg;

const OWNER_A = '00000000-aaaa-4001-a000-000000000001';
const OWNER_B = '00000000-aaaa-4001-a000-000000000002';

function makeToken(sub: string): string {
  return `fake:${sub}`;
}

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let reviveContainerCalled: string | null = null;
let emitOwnerEventCalls: Array<{ ownerId: string; type: string }> = [];

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Seed auth.users rows for FK constraints
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES
      ($1, 'topup-owner-a@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', ''),
      ($2, 'topup-owner-b@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_A, OWNER_B]);

  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);

  app = Fastify();
  await registerPetRoutes(app, {
    generateSoulMd: () => '# SOUL topup',
    generateSkillMd: () => '# SKILL topup',
    reviveContainer: async (containerId: string) => { reviveContainerCalled = containerId; },
    emitOwnerEvent: (ownerId, event) => { emitOwnerEventCalls.push({ ownerId, type: event.type }); },
  });
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);
  await pool.end();
  await app.close();
});

describe('POST /api/pets/:id/topup', () => {
  let petId: string;

  // Seed a pet with wallet_address + container_status so topup can work
  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md, wallet_address, container_status, container_id, onchain_balance)
      VALUES ($1, 'TopupPet', '# soul', '# skill', '0xDeadBeef0000000000000000000000000000cafe', 'running', 'fake-container-id', '0.05')
      RETURNING id
    `, [OWNER_A]);
    petId = rows[0].id;
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/pets/${petId}/topup` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for non-existent pet', async () => {
    mockGetPawBalance.mockResolvedValue('100.0');
    const res = await app.inject({
      method: 'POST', url: '/api/pets/00000000-0000-4000-b000-999999999001/topup',
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('returns 403 for wrong owner', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/topup`,
      headers: { authorization: `Bearer ${makeToken(OWNER_B)}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('FORBIDDEN');
  });

  it('returns 400 when wallet not assigned', async () => {
    // Insert pet with no wallet_address
    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md, container_status)
      VALUES ($1, 'NoWalletPet', '# soul', '# skill', 'created')
      RETURNING id
    `, [OWNER_A]);
    const noWalletPetId = rows[0].id;

    const res = await app.inject({
      method: 'POST', url: `/api/pets/${noWalletPetId}/topup`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('NO_WALLET');

    await pool.query('DELETE FROM pets WHERE id = $1', [noWalletPetId]);
  });

  it('updates onchain_balance for running pet (no revival)', async () => {
    mockGetPawBalance.mockResolvedValue('0.08');
    reviveContainerCalled = null;
    emitOwnerEventCalls = [];

    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/topup`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; onchain_balance: string };
    expect(body.ok).toBe(true);
    expect(body.onchain_balance).toBe('0.08');

    const { rows } = await pool.query('SELECT onchain_balance FROM pets WHERE id = $1', [petId]);
    expect(parseFloat(rows[0].onchain_balance)).toBeCloseTo(0.08);

    expect(reviveContainerCalled).toBeNull();
    expect(emitOwnerEventCalls.find(e => e.type === 'pet.revived')).toBeUndefined();
  });

  it('revives stopped pet when onchain_balance > 0', async () => {
    await pool.query("UPDATE pets SET container_status = 'stopped', onchain_balance = '0' WHERE id = $1", [petId]);

    mockGetPawBalance.mockResolvedValue('0.05');
    reviveContainerCalled = null;
    emitOwnerEventCalls = [];

    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/topup`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; onchain_balance: string };
    expect(body.ok).toBe(true);
    expect(body.onchain_balance).toBe('0.05');

    const { rows } = await pool.query('SELECT onchain_balance FROM pets WHERE id = $1', [petId]);
    expect(parseFloat(rows[0].onchain_balance)).toBeCloseTo(0.05);

    expect(reviveContainerCalled).toBe('fake-container-id');
    expect(emitOwnerEventCalls.find(e => e.type === 'pet.revived')).toBeDefined();
  });
});

describe('GET /api/pets/:id — system_credits + onchain_balance + total_balance', () => {
  let petId: string;

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md, system_credits, onchain_balance, initial_credits)
      VALUES ($1, 'BalancePet', '# soul', '# skill', '0.12', '0.05', 0.3)
      RETURNING id
    `, [OWNER_A]);
    petId = rows[0].id;
  });

  it('includes system_credits, onchain_balance, total_balance, initial_credits in response', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/pets/${petId}`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { system_credits: string; onchain_balance: string; total_balance: string; initial_credits: string };
    expect(parseFloat(body.system_credits)).toBeCloseTo(0.12);
    expect(parseFloat(body.onchain_balance)).toBeCloseTo(0.05);
    expect(parseFloat(body.total_balance)).toBeCloseTo(0.17);
    expect(parseFloat(body.initial_credits)).toBeCloseTo(0.3);
  });

  it('returns "0" for system_credits and onchain_balance defaults', async () => {
    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md)
      VALUES ($1, 'DefaultBalancePet', '# soul', '# skill')
      RETURNING id
    `, [OWNER_A]);
    const defaultPetId = rows[0].id;

    const res = await app.inject({
      method: 'GET', url: `/api/pets/${defaultPetId}`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { system_credits: string; onchain_balance: string; total_balance: string };
    expect(body.system_credits).toBe('0');
    expect(body.onchain_balance).toBe('0');
    expect(body.total_balance).toBe('0');
  });
});
