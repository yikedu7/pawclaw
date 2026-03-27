import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerPetRoutes } from '../petRoutes.js';

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

// Use the local Supabase JWT secret — same key the JWKS endpoint exposes.
const JWT_SECRET = process.env.JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const OWNER_A = '00000000-aaaa-4001-a000-000000000001';
const OWNER_B = '00000000-aaaa-4001-a000-000000000002';

function makeToken(sub: string): string {
  return jwt.sign({ sub }, JWT_SECRET);
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
      INSERT INTO pets (owner_id, name, soul_md, skill_md, wallet_address, container_status, container_id, paw_balance, initial_credits)
      VALUES ($1, 'TopupPet', '# soul', '# skill', '0xDeadBeef0000000000000000000000000000cafe', 'running', 'fake-container-id', '150', 200)
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

  it('updates paw_balance for running pet (no revival)', async () => {
    mockGetPawBalance.mockResolvedValue('175.5');
    reviveContainerCalled = null;
    emitOwnerEventCalls = [];

    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/topup`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; paw_balance: string };
    expect(body.ok).toBe(true);
    expect(body.paw_balance).toBe('175.5');

    // DB side effect: paw_balance updated
    const { rows } = await pool.query('SELECT paw_balance FROM pets WHERE id = $1', [petId]);
    expect(parseFloat(rows[0].paw_balance)).toBeCloseTo(175.5);

    // No revival for running pet
    expect(reviveContainerCalled).toBeNull();
    expect(emitOwnerEventCalls.find(e => e.type === 'pet.revived')).toBeUndefined();
  });

  it('revives stopped pet when balance > 0', async () => {
    // Set pet to stopped
    await pool.query("UPDATE pets SET container_status = 'stopped', paw_balance = '0' WHERE id = $1", [petId]);

    mockGetPawBalance.mockResolvedValue('50.0');
    reviveContainerCalled = null;
    emitOwnerEventCalls = [];

    const res = await app.inject({
      method: 'POST', url: `/api/pets/${petId}/topup`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; paw_balance: string };
    expect(body.ok).toBe(true);
    expect(body.paw_balance).toBe('50.0');

    // DB side effect: paw_balance updated
    const { rows } = await pool.query('SELECT paw_balance FROM pets WHERE id = $1', [petId]);
    expect(parseFloat(rows[0].paw_balance)).toBeCloseTo(50.0);

    // Revival triggered
    expect(reviveContainerCalled).toBe('fake-container-id');
    expect(emitOwnerEventCalls.find(e => e.type === 'pet.revived')).toBeDefined();
  });
});

describe('GET /api/pets/:id — paw_balance + initial_credits', () => {
  let petId: string;

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md, paw_balance, initial_credits)
      VALUES ($1, 'BalancePet', '# soul', '# skill', '120.5', 300)
      RETURNING id
    `, [OWNER_A]);
    petId = rows[0].id;
  });

  it('includes paw_balance and initial_credits in response', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/pets/${petId}`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { paw_balance: string; initial_credits: number };
    expect(parseFloat(body.paw_balance)).toBeCloseTo(120.5);
    expect(body.initial_credits).toBe(300);
  });

  it('returns paw_balance as "0" when null in DB', async () => {
    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md)
      VALUES ($1, 'NullBalancePet', '# soul', '# skill')
      RETURNING id
    `, [OWNER_A]);
    const nullPetId = rows[0].id;

    const res = await app.inject({
      method: 'GET', url: `/api/pets/${nullPetId}`,
      headers: { authorization: `Bearer ${makeToken(OWNER_A)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { paw_balance: string };
    expect(body.paw_balance).toBe('0');
  });
});
