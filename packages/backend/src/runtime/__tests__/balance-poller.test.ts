/**
 * Unit tests for the balance poller — death detection and paw_balance DB write.
 *
 * Mocks ethers.js (getPawBalance), stopContainer, and tickBus.
 * Uses real DB for side effects (paw_balance column update).
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// vi.hoisted ensures these are initialised before vi.mock hoisting
const mockGetPawBalance = vi.hoisted(() => vi.fn<() => Promise<string>>());
const mockStopContainer = vi.hoisted(() => vi.fn<() => Promise<void>>());
const tickBusEmits = vi.hoisted(() => [] as Array<{ ownerId: string; eventType: string }>);

vi.mock('../../onchain/balance.js', () => ({
  getPawBalance: mockGetPawBalance,
}));

vi.mock('../container.js', () => ({
  stopContainer: mockStopContainer,
}));

vi.mock('../tick-bus.js', () => ({
  tickBus: {
    emit: (_event: string, ownerId: string, wsEvent: { type: string }) => {
      tickBusEmits.push({ ownerId, eventType: wsEvent.type });
    },
  },
}));

import pg from 'pg';
import { pollBalances } from '../balance-poller.js';

const { Pool } = pg;

const OWNER_A = '00000000-aaaa-4002-a000-000000000001';

let pool: InstanceType<typeof Pool>;
let runningPetId: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });

  // Seed auth user
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'poller-owner@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_A]);

  // Insert a running pet with wallet_address + container_id
  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, wallet_address, container_status, container_id, initial_credits, hunger, mood, affection)
    VALUES ($1, 'PollerPet', '# soul', '# skill', '0xaaaa000000000000000000000000000000000001', 'running', 'poller-container-id', 200, 80, 70, 30)
    RETURNING id
  `, [OWNER_A]);
  runningPetId = rows[0].id;
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER_A]);
  await pool.end();
});

beforeEach(() => {
  tickBusEmits.length = 0;
  mockStopContainer.mockReset();
  mockGetPawBalance.mockReset();
  mockStopContainer.mockResolvedValue(undefined);
});

describe('pollBalances', () => {
  it('updates paw_balance in DB and emits pet.state when balance > 0', async () => {
    mockGetPawBalance.mockResolvedValue('150.0');

    await pollBalances();

    // DB: paw_balance updated
    const { rows } = await pool.query('SELECT paw_balance FROM pets WHERE id = $1', [runningPetId]);
    expect(parseFloat(rows[0].paw_balance)).toBeCloseTo(150.0);

    // pet.state emitted with hunger = Math.round(150/200*100) = 75
    const stateEmit = tickBusEmits.find(e => e.eventType === 'pet.state');
    expect(stateEmit).toBeDefined();
    expect(stateEmit?.ownerId).toBe(OWNER_A);

    // No death
    expect(mockStopContainer).not.toHaveBeenCalled();
    expect(tickBusEmits.find(e => e.eventType === 'pet.died')).toBeUndefined();
  });

  it('stops container and emits pet.died when balance hits 0', async () => {
    mockGetPawBalance.mockResolvedValue('0.0');

    await pollBalances();

    // DB: paw_balance = 0
    const { rows } = await pool.query('SELECT paw_balance, container_status FROM pets WHERE id = $1', [runningPetId]);
    expect(parseFloat(rows[0].paw_balance)).toBe(0);

    // Container stopped
    expect(mockStopContainer).toHaveBeenCalledWith('poller-container-id');

    // pet.died emitted
    const diedEmit = tickBusEmits.find(e => e.eventType === 'pet.died');
    expect(diedEmit).toBeDefined();
    expect(diedEmit?.ownerId).toBe(OWNER_A);

    // No pet.state for dead pet
    expect(tickBusEmits.find(e => e.eventType === 'pet.state')).toBeUndefined();

    // Restore to running for subsequent tests
    await pool.query("UPDATE pets SET container_status = 'running' WHERE id = $1", [runningPetId]);
  });

  it('skips pets without wallet_address', async () => {
    // Insert pet without wallet
    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md, container_status)
      VALUES ($1, 'NoWalletPollerPet', '# soul', '# skill', 'running')
      RETURNING id
    `, [OWNER_A]);
    const noWalletId = rows[0].id;

    mockGetPawBalance.mockResolvedValue('100.0');
    await pollBalances();

    // getPawBalance only called for pets with wallet_address (i.e., runningPetId, not noWalletId)
    expect(mockGetPawBalance).toHaveBeenCalledTimes(1);
    expect(mockGetPawBalance).toHaveBeenCalledWith('0xaaaa000000000000000000000000000000000001');

    await pool.query('DELETE FROM pets WHERE id = $1', [noWalletId]);
  });
});
