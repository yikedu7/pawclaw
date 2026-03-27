/**
 * End-to-end flow test for the credits + heartbeat lifecycle.
 *
 * Exercises the full sequence in order:
 *   1. grantDbCredits → sets system_credits=0.24, onchain_balance=0, hunger=20
 *   2. /deduct → decrements system_credits by HEARTBEAT_COST (0.0125), recomputes hunger
 *   3. Balance at threshold → /deduct → pet.died fires
 *   4. x402 path: first call → 402, replay with EIP-3009 → 200 + tx inserted + onchain_balance deducted
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

const TOKEN_ADDRESS = '0x0000000000000000000000000000000000000042';
const TOKEN_NAME = 'USDC';
const PLATFORM_WALLET = '0x0000000000000000000000000000000000000001';
const FAKE_TX_HASH = '0x' + 'ee'.repeat(32);

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
  const domain = { name: TOKEN_NAME, version: '1', chainId: 196n, verifyingContract: TOKEN_ADDRESS };
  return wallet.signTypedData(domain, EIP3009_TYPES, authorization);
}

function makeAuthorization(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    from: petWallet.address,
    to: PLATFORM_WALLET,
    value: '12500', // 0.0125 USDC with 6 decimals
    validAfter: '0',
    validBefore: String(Math.floor(Date.now() / 1000) + 3600),
    nonce: ethers.hexlify(ethers.randomBytes(32)),
    ...overrides,
  };
}

function encodePaymentSignature(authorization: Record<string, string>, signature: string): string {
  return Buffer.from(JSON.stringify({ authorization, signature })).toString('base64');
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  petWallet = new ethers.Wallet('0x' + '55'.repeat(32));

  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'credits-e2e@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER]);

  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, wallet_address, gateway_token)
    VALUES ($1, 'E2EPet', '# soul', '# skill', $2, $3)
    RETURNING id
  `, [OWNER, petWallet.address, GATEWAY_TOKEN]);
  petId = rows[0].id;

  process.env.PAYMENT_TOKEN_ADDRESS = TOKEN_ADDRESS;
  process.env.PAYMENT_TOKEN_NAME = TOKEN_NAME;
  process.env.PAYMENT_TOKEN_VERSION = '1';
  process.env.PLATFORM_WALLET_ADDRESS = PLATFORM_WALLET;
  process.env.PAYMENT_TOKEN_DECIMALS = '6';

  app = Fastify({ logger: false });
  await registerOpenclawRoutes(app, {
    emitOwnerEvent: (_ownerId, event) => { emittedEvents.push(event); },
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
  delete process.env.PAYMENT_TOKEN_VERSION;
  delete process.env.PLATFORM_WALLET_ADDRESS;
  delete process.env.PAYMENT_TOKEN_DECIMALS;
});

const authHeader = { authorization: `Bearer ${GATEWAY_TOKEN}` };

describe('Credits + heartbeat e2e flow', () => {
  describe('Step 1: grantDbCredits sets system_credits=0.24, onchain_balance=0, hunger=20', () => {
    it('writes expected initial values', async () => {
      await grantDbCredits(petId);

      const { rows } = await pool.query<{ system_credits: string; onchain_balance: string; hunger: number; initial_credits: string }>(
        'SELECT system_credits, onchain_balance, hunger, initial_credits FROM pets WHERE id = $1',
        [petId],
      );
      expect(rows).toHaveLength(1);
      expect(parseFloat(rows[0].system_credits)).toBeCloseTo(0.24);
      expect(parseFloat(rows[0].onchain_balance)).toBe(0);
      expect(rows[0].hunger).toBe(20);
      expect(parseFloat(rows[0].initial_credits)).toBeCloseTo(0.3);
    });
  });

  describe('Step 2: /deduct decrements system_credits and recomputes hunger', () => {
    it('decrements system_credits by HEARTBEAT_COST (0.0125)', async () => {
      await pool.query('UPDATE pets SET system_credits = $1, onchain_balance = $2 WHERE id = $3', ['0.24', '0', petId]);

      const res = await app.inject({
        method: 'POST',
        url: `/internal/heartbeat/${petId}/deduct`,
        headers: authHeader,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });

      const { rows } = await pool.query<{ system_credits: string; hunger: number }>(
        'SELECT system_credits, hunger FROM pets WHERE id = $1',
        [petId],
      );
      expect(parseFloat(rows[0].system_credits)).toBeCloseTo(0.24 - 0.0125, 4);
      // hunger = clamp((1 - (0.24-0.0125)/0.3)*100) = clamp((1 - 0.2275/0.3)*100) ≈ 24
      expect(rows[0].hunger).toBeGreaterThan(20);
      expect(rows[0].hunger).toBeLessThan(50);
    });

    it('does not emit pet.died while total_balance remains positive', async () => {
      await pool.query('UPDATE pets SET system_credits = $1, onchain_balance = $2 WHERE id = $3', ['0.2', '0', petId]);
      emittedEvents.length = 0;

      await app.inject({
        method: 'POST',
        url: `/internal/heartbeat/${petId}/deduct`,
        headers: authHeader,
      });

      expect(emittedEvents.find((e) => e.type === 'pet.died')).toBeUndefined();
    });
  });

  describe('Step 3: pet.died fires when total_balance reaches zero', () => {
    it('emits pet.died when system_credits is exactly HEARTBEAT_COST', async () => {
      await pool.query('UPDATE pets SET system_credits = $1, onchain_balance = $2 WHERE id = $3', ['0.0125', '0', petId]);
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

  describe('Step 4: x402 success path deducts onchain_balance', () => {
    it('returns 402 on first call with no PAYMENT-SIGNATURE header', async () => {
      await pool.query('UPDATE pets SET system_credits = $1, onchain_balance = $2 WHERE id = $3', ['0.1', '0.1', petId]);

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
            amount: '0.0125',
            payTo: PLATFORM_WALLET,
            asset: TOKEN_ADDRESS,
          }),
        ]),
      });
    });

    it('returns 200, inserts tx row, and deducts onchain_balance on valid EIP-3009 payment', async () => {
      await pool.query('UPDATE pets SET system_credits = $1, onchain_balance = $2 WHERE id = $3', ['0', '0.1', petId]);
      await pool.query('DELETE FROM transactions WHERE tx_hash = $1', [FAKE_TX_HASH]);

      const authorization = makeAuthorization();
      const signature = await signAuthorization(petWallet, authorization);
      const paymentSignature = encodePaymentSignature(authorization, signature);

      const res = await app.inject({
        method: 'POST',
        url: `/internal/heartbeat/${petId}`,
        headers: { ...authHeader, 'payment-signature': paymentSignature },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, tx_hash: FAKE_TX_HASH });

      // Transaction inserted
      const { rows: txRows } = await pool.query(
        'SELECT from_wallet, to_wallet, tx_hash FROM transactions WHERE tx_hash = $1',
        [FAKE_TX_HASH],
      );
      expect(txRows).toHaveLength(1);
      expect(txRows[0].from_wallet.toLowerCase()).toBe(petWallet.address.toLowerCase());

      // onchain_balance deducted: 0.1 - (12500 / 10^6) = 0.1 - 0.0125 = 0.0875
      const { rows: petRows } = await pool.query<{ onchain_balance: string }>(
        'SELECT onchain_balance FROM pets WHERE id = $1',
        [petId],
      );
      expect(parseFloat(petRows[0].onchain_balance)).toBeCloseTo(0.1 - 0.0125, 4);
    });
  });
});
