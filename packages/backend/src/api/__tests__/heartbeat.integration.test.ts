/**
 * Integration tests for POST /internal/heartbeat/:petId.
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
import { buildX402Response } from '../../payment/x402.js';

const { Pool } = pg;

const OWNER = '00000000-eeee-4002-a000-000000000099';

// Deterministic fake token + platform addresses for tests
const TOKEN_ADDRESS = '0x0000000000000000000000000000000000000042';
const TOKEN_NAME = 'PAW';
const PLATFORM_WALLET = '0x0000000000000000000000000000000000000001';
const GATEWAY_TOKEN = 'heartbeat-test-gateway-token';

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

const FAKE_TX_HASH = '0x' + 'dd'.repeat(32);

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;
let petId: string;
let petWallet: ethers.Wallet;

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
    value: '1000000000000000',
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
  petWallet = new ethers.Wallet('0x' + '44'.repeat(32));

  // Seed auth user
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'heartbeat-test@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER]);

  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER]);

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, wallet_address, gateway_token, paw_balance)
    VALUES ($1, 'HeartbeatPet', '# soul', '# skill', $2, $3, '10.0')
    RETURNING id
  `, [OWNER, petWallet.address, GATEWAY_TOKEN]);
  petId = rows[0].id;

  process.env.PAYMENT_TOKEN_ADDRESS = TOKEN_ADDRESS;
  process.env.PAYMENT_TOKEN_NAME = TOKEN_NAME;
  process.env.PLATFORM_WALLET_ADDRESS = PLATFORM_WALLET;
  process.env.PAYMENT_TOKEN_DECIMALS = '18';

  app = Fastify({ logger: false });
  await registerOpenclawRoutes(app, {
    emitOwnerEvent: () => {},
    // Stub blockchain submission — signature verification runs for real
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

describe('POST /internal/heartbeat/:petId', () => {
  it('returns 402 on first call with no PAYMENT-SIGNATURE header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/heartbeat/${petId}`,
      headers: authHeader,
    });

    expect(res.statusCode).toBe(402);

    // Body should be base64-encoded X402 requirements
    const decoded = JSON.parse(Buffer.from(res.body, 'base64').toString('utf8'));
    expect(decoded).toMatchObject({
      x402Version: 2,
      accepts: expect.arrayContaining([
        expect.objectContaining({
          network: 'eip155:196',
          amount: '0.001',
          payTo: PLATFORM_WALLET,
          asset: TOKEN_ADDRESS,
        }),
      ]),
    });
  });

  it('returns 200, inserts transaction, and deducts paw_balance on valid payment', async () => {
    // Reset paw_balance to a known value before this test
    await pool.query('UPDATE pets SET paw_balance = $1 WHERE id = $2', ['10.0', petId]);
    // Clean up any previously inserted tx rows
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
    expect(txRows[0].amount).toBe('1000000000000000');
    expect(txRows[0].tx_hash).toBe(FAKE_TX_HASH);

    // DB side effect: paw_balance deducted (10.0 - 0.001 = 9.999)
    const { rows: petRows } = await pool.query<{ paw_balance: string }>(
      'SELECT paw_balance FROM pets WHERE id = $1',
      [petId],
    );
    expect(parseFloat(petRows[0].paw_balance)).toBeCloseTo(10.0 - 0.001, 6);
  });

  it('returns 401 when EIP-3009 signature is malformed', async () => {
    const authorization = makeAuthorization();
    // Not a valid signature
    const badSignature = '0xdeadbeef';
    const paymentSignature = encodePaymentSignature(authorization, badSignature);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/heartbeat/${petId}`,
      headers: {
        ...authHeader,
        'payment-signature': paymentSignature,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  it('returns 401 when signature is from the wrong signer', async () => {
    const wrongWallet = ethers.Wallet.createRandom();
    const authorization = makeAuthorization({ from: wrongWallet.address });
    // Sign with wrong wallet — recovered signer won't match pet.wallet_address
    const signature = await signAuthorization(wrongWallet, authorization);
    const paymentSignature = encodePaymentSignature(authorization, signature);

    const res = await app.inject({
      method: 'POST',
      url: `/internal/heartbeat/${petId}`,
      headers: {
        ...authHeader,
        'payment-signature': paymentSignature,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  it('returns 401 when authorization.to does not match platform wallet', async () => {
    const wrongTo = ethers.Wallet.createRandom().address;
    const authorization = makeAuthorization({ to: wrongTo });
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

    // signer recovers as petWallet but to !== platform wallet → 401
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_DESTINATION');
  });

  it('returns 401 when gateway_token is missing or wrong', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/internal/heartbeat/${petId}`,
      headers: { authorization: 'Bearer wrong-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when petId does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/heartbeat/00000000-0000-4000-b000-999999999999',
      headers: { authorization: 'Bearer any-token' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});
