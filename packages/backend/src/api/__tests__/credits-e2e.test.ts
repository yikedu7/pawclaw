/**
 * End-to-end flow test for the credits + heartbeat lifecycle.
 *
 * Exercises the full sequence in order:
 *   1. Create pet → grantDbCredits → verify paw_balance = 200
 *   2. /deduct multiple times → verify balance decrements correctly
 *   3. Set balance to HEARTBEAT_COST, /deduct → verify pet.died fires
 *   4. x402 path: first call → 402, replay with EIP-3009 → 200 + tx inserted
 *
 * Requires a real Supabase local DB:
 *   supabase start && supabase db reset
 *
 * Blockchain submission is replaced by a deterministic stub via the deps
 * injection point — EIP-3009 signature verification runs against real ethers.js.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { ethers } from 'ethers';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerOpenclawRoutes } from '../openclawRoutes.js';
import { grantDbCredits } from '../../onchain/credits.js';
import type { WsEvent } from '@pawclaw/shared';

const { Pool } = pg;

const OWNER = '00000000-eeee-4004-a000-000000000099';
const GATEWAY_TOKEN = 'e2e-credits-gateway-token';

// Deterministic fake token + platform addresses for tests
const TOKEN_ADDRESS = '0x0000000000000000000000000000000000000042';
const TOKEN_NAME = 'PAW';
const PLATFORM_WALLET = '0x0000000000000000000000000000000000000001';

const FAKE_TX_HASH = '0x' + 'ee'.repeat(32);

// EIP-3009 typed data (must match verify.ts)
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let petId: string;
let petWallet: ethers.Wallet;
const emittedEvents: WsEvent[] = [];

async function signAuthorization(
  wallet: ethers.BaseWallet,
  authorization: Record<string, string>,
): Promise<string> {
  const domain = {
    name: TOKEN_NAME,
    version: '1',
    chainId: 196n,
    verifyingContract: TOKEN_ADDRESS,
  };
  return wallet.signTypedData(domain, EIP3009_TYPES, authorization);
}

function makeAuthorization(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    from: petWallet.address,
    to: PLATFORM_WALLET,
    value: '1', // 1 micro-unit (6 decimals) = 0.000001
    validAfter: '0',
    validBefore: String(Math.floor(Date.now() / 1000) + 3600),
    nonce: ethers.hexlify(ethers.randomBytes(32)),
    ...overrides,
  };
}

function encodePaymentSignature(authorization: Record<string, string>, signature: string): string {
  const payload = { authorization, signature };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Deterministic test wallet
  petWallet = new ethers.Wallet('0x' + '55'.repeat(32));

  // Seed auth user
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'credits-e2e@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER]);

  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, wallet_address, gateway_token, paw_balance)
    VALUES ($1, 'E2EPet', '# soul', '# skill', $2, $3, NULL)
    RETURNING id
  `, [OWNER, petWallet.address, GATEWAY_TOKEN]);
  petId = rows[0].id;

  process.env.PAYMENT_TOKEN_ADDRESS = TOKEN_ADDRESS;
  process.env.PAYMENT_TOKEN_NAME = TOKEN_NAME;
  process.env.PLATFORM_WALLET_ADDRESS = PLATFORM_WALLET;
  process.env.PAYMENT_TOKEN_DECIMALS = '6';

  app = Fastify({ logger: false });
  await registerOpenclawRoutes(app, {
    emitOwnerEvent: (_ownerId, event) => { emittedEvents.push(event); },
    // Stub blockchain submission — EIP-3009 signature verification runs for real
    submitHeartbeatTx: async () => FAKE_TX_HASH,
  });
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM transactions WHERE tx_hash = $1', [FAKE_TX_HASH]);
  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);
  await pool.end();
  await app.close();
  delete process.env.PAYMENT_TOKEN_ADDRESS;
  delete process.env.PAYMENT_TOKEN_NAME;
  delete process.env.PLATFORM_WALLET_ADDRESS;
  delete process.env.PAYMENT_TOKEN_DECIMALS;
});

const authHeader = { authorization: `Bearer ${GATEWAY_TOKEN}` };

describe('Credits + heartbeat e2e flow', () => {
  describe('Step 1: grantDbCredits sets paw_balance = initial_credits', () => {
    it('sets paw_balance equal to initial_credits (default 200) after grant', async () => {
      await grantDbCredits(petId);

      const { rows } = await pool.query<{ paw_balance: string; initial_credits: number }>(
        'SELECT paw_balance, initial_credits FROM pets WHERE id = $1',
        [petId],
      );
      expect(rows).toHaveLength(1);
      expect(parseFloat(rows[0].paw_balance)).toBe(rows[0].initial_credits);
      expect(rows[0].initial_credits).toBe(200);
    });
  });

  describe('Step 2: /deduct decrements paw_balance correctly', () => {
    it('decrements balance by exactly 0.000001 on first deduct call', async () => {
      await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['200.0', petId]);

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
      expect(parseFloat(rows[0].paw_balance)).toBeCloseTo(200.0 - 0.000001, 6);
    });

    it('decrements balance by exactly 0.000001 on a subsequent deduct call', async () => {
      const { rows: before } = await pool.query<{ paw_balance: string }>(
        'SELECT paw_balance FROM pets WHERE id = $1',
        [petId],
      );
      const balanceBefore = parseFloat(before[0].paw_balance);

      const res = await app.inject({
        method: 'POST',
        url: `/internal/heartbeat/${petId}/deduct`,
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);

      const { rows: after } = await pool.query<{ paw_balance: string }>(
        'SELECT paw_balance FROM pets WHERE id = $1',
        [petId],
      );
      expect(parseFloat(after[0].paw_balance)).toBeCloseTo(balanceBefore - 0.000001, 6);
    });

    it('does not emit pet.died while balance remains positive', async () => {
      await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['10.0', petId]);
      emittedEvents.length = 0;

      await app.inject({
        method: 'POST',
        url: `/internal/heartbeat/${petId}/deduct`,
        headers: authHeader,
      });

      expect(emittedEvents.find((e) => e.type === 'pet.died')).toBeUndefined();
    });
  });

  describe('Step 3: pet.died fires when balance reaches zero', () => {
    it('emits pet.died when paw_balance is exactly HEARTBEAT_COST (0.000001)', async () => {
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
  });

  describe('Step 4: x402 success path', () => {
    it('returns 402 on first call with no PAYMENT-SIGNATURE header', async () => {
      // Restore a positive balance so the route reaches the payment check
      await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['10.0', petId]);

      const res = await app.inject({
        method: 'POST',
        url: `/internal/heartbeat/${petId}`,
        headers: authHeader,
      });

      expect(res.statusCode).toBe(402);

      const decoded = JSON.parse(Buffer.from(res.body, 'base64').toString('utf8'));
      expect(decoded).toMatchObject({
        x402Version: 2,
        accepts: expect.arrayContaining([
          expect.objectContaining({
            network: 'eip155:196',
            amount: '0.000001',
            payTo: PLATFORM_WALLET,
            asset: TOKEN_ADDRESS,
          }),
        ]),
      });
    });

    it('returns 200, inserts a transaction row, and deducts paw_balance on valid EIP-3009 payment', async () => {
      await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['10.0', petId]);
      await pool.query('DELETE FROM transactions WHERE tx_hash = $1', [FAKE_TX_HASH]);

      const authorization = makeAuthorization();
      const signature = await signAuthorization(petWallet, authorization);
      const paymentSignature = encodePaymentSignature(authorization, signature);

      const res = await app.inject({
        method: 'POST',
        url: `/internal/heartbeat/${petId}`,
        headers: {
          ...authHeader,
          'payment-signature': paymentSignature,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, tx_hash: FAKE_TX_HASH });

      // DB side effect: transaction row inserted
      const { rows: txRows } = await pool.query<{
        from_wallet: string;
        to_wallet: string;
        amount: string;
        tx_hash: string;
      }>(
        'SELECT from_wallet, to_wallet, amount, tx_hash FROM transactions WHERE tx_hash = $1',
        [FAKE_TX_HASH],
      );
      expect(txRows).toHaveLength(1);
      expect(txRows[0].from_wallet.toLowerCase()).toBe(petWallet.address.toLowerCase());
      expect(txRows[0].to_wallet.toLowerCase()).toBe(PLATFORM_WALLET.toLowerCase());
      expect(txRows[0].amount).toBe('1');
      expect(txRows[0].tx_hash).toBe(FAKE_TX_HASH);

      // DB side effect: paw_balance deducted (10.0 - 0.000001 = 9.999999)
      const { rows: petRows } = await pool.query<{ paw_balance: string }>(
        'SELECT paw_balance FROM pets WHERE id = $1',
        [petId],
      );
      expect(parseFloat(petRows[0].paw_balance)).toBeCloseTo(10.0 - 0.000001, 6);
    });
  });
});
