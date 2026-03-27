/**
 * Unit tests for the balance poller — onchain_balance overwrite, hunger recompute, death detection.
 *
 * Mocks ethers.js (getPawBalance), stopContainer, and tickBus.
 * Uses real DB for side effects (onchain_balance column update).
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const mockGetPawBalance = vi.hoisted(() => vi.fn<() => Promise<string>>());
const mockStopContainer = vi.hoisted(() => vi.fn<() => Promise<void>>());
const tickBusEmits = vi.hoisted(() => [] as Array<{ ownerId: string; eventType: string; data?: unknown }>);

vi.mock('../../onchain/balance.js', () => ({
  getPawBalance: mockGetPawBalance,
}));

vi.mock('../container.js', () => ({
  stopContainer: mockStopContainer,
}));

vi.mock('../tick-bus.js', () => ({
  tickBus: {
    emit: (_event: string, ownerId: string, wsEvent: { type: string; data?: unknown }) => {
      tickBusEmits.push({ ownerId, eventType: wsEvent.type, data: wsEvent.data });
    },
  },
}));

import pg from 'pg';
import { pollBalances } from '../balance-poller.js';

const { Pool } = pg;

const OWNER_A = '00000000-aaaa-4002-a000-000000000001';
const mockLog = { error: vi.fn() };

let pool: InstanceType<typeof Pool>;
let runningPetId: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });

  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'poller-owner@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_A]);

  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER_A]);
  await pool.query("UPDATE pets SET container_status = 'stopped' WHERE owner_id != $1 AND container_status = 'running'", [OWNER_A]);

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, wallet_address, container_status, container_id, initial_credits, system_credits, onchain_balance, hunger, mood, affection)
    VALUES ($1, 'PollerPet', '# soul', '# skill', '0xaaaa000000000000000000000000000000000001', 'running', 'poller-container-id', 0.3, 0.1, 0.0, 67, 70, 30)
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
  it('overwrites onchain_balance and emits pet.state when total_balance > 0', async () => {
    // system_credits=0.1, onchain=0.15 → total=0.25 → hunger=(1-0.25/0.3)*100≈17
    await pool.query('UPDATE pets SET system_credits = $1 WHERE id = $2', ['0.1', runningPetId]);
    mockGetPawBalance.mockResolvedValue('0.15');

    await pollBalances(mockLog);

    const { rows } = await pool.query('SELECT onchain_balance, hunger FROM pets WHERE id = $1', [runningPetId]);
    expect(parseFloat(rows[0].onchain_balance)).toBeCloseTo(0.15);
    expect(rows[0].hunger).toBeGreaterThanOrEqual(0);
    expect(rows[0].hunger).toBeLessThan(50);

    const stateEmit = tickBusEmits.find(e => e.eventType === 'pet.state');
    expect(stateEmit).toBeDefined();
    expect(stateEmit?.ownerId).toBe(OWNER_A);

    expect(mockStopContainer).not.toHaveBeenCalled();
    expect(tickBusEmits.find(e => e.eventType === 'pet.died')).toBeUndefined();
  });

  it('stops container and emits pet.died when total_balance hits 0', async () => {
    await pool.query('UPDATE pets SET system_credits = $1 WHERE id = $2', ['0', runningPetId]);
    mockGetPawBalance.mockResolvedValue('0.0');

    await pollBalances(mockLog);

    const { rows } = await pool.query('SELECT onchain_balance FROM pets WHERE id = $1', [runningPetId]);
    expect(parseFloat(rows[0].onchain_balance)).toBe(0);

    expect(mockStopContainer).toHaveBeenCalledWith('poller-container-id');

    const diedEmit = tickBusEmits.find(e => e.eventType === 'pet.died');
    expect(diedEmit).toBeDefined();
    expect(diedEmit?.ownerId).toBe(OWNER_A);
    expect(tickBusEmits.find(e => e.eventType === 'pet.state')).toBeUndefined();

    await pool.query("UPDATE pets SET container_status = 'running' WHERE id = $1", [runningPetId]);
  });

  it('detects user topup: onchain_balance overwritten with higher value', async () => {
    await pool.query('UPDATE pets SET system_credits = $1, onchain_balance = $2 WHERE id = $3', ['0.1', '0.05', runningPetId]);
    mockGetPawBalance.mockResolvedValue('0.2'); // user topped up on-chain

    await pollBalances(mockLog);

    const { rows } = await pool.query('SELECT onchain_balance FROM pets WHERE id = $1', [runningPetId]);
    expect(parseFloat(rows[0].onchain_balance)).toBeCloseTo(0.2); // overwritten, not delta
  });

  it('skips pets without wallet_address', async () => {
    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md, container_status)
      VALUES ($1, 'NoWalletPollerPet', '# soul', '# skill', 'running')
      RETURNING id
    `, [OWNER_A]);
    const noWalletId = rows[0].id;

    mockGetPawBalance.mockResolvedValue('0.1');
    await pollBalances(mockLog);

    expect(mockGetPawBalance).toHaveBeenCalledTimes(1);
    expect(mockGetPawBalance).toHaveBeenCalledWith('0xaaaa000000000000000000000000000000000001');

    await pool.query('DELETE FROM pets WHERE id = $1', [noWalletId]);
  });
});
