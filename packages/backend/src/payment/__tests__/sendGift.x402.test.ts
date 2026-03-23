/**
 * Integration tests for the x402 payment flow on POST /internal/tools/send_gift.
 *
 * Requires a real Supabase local DB:
 *   supabase start && supabase db reset
 *
 * Blockchain submission is replaced by a deterministic stub via the deps
 * injection point — signature verification runs against real ethers.js.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { ethers } from 'ethers';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerOpenclawRoutes } from '../../api/openclawRoutes.js';

const { Pool } = pg;

const WEBHOOK_TOKEN = 'x402-test-secret';
const OWNER_A = '00000000-eeee-4000-d000-000000000011';
const OWNER_B = '00000000-eeee-4000-d000-000000000012';

// A deterministic fake token address for domain construction in tests (all lowercase = valid)
const TOKEN_ADDRESS = '0x0000000000000000000000000000000000000001';
const TOKEN_NAME = 'USD Coin';

// EIP-3009 types used for signing in tests (must match verify.ts)
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
let otherPetId: string;
let senderWallet: ethers.Wallet;
let recipientWalletAddress: string;

// Fake tx hash returned by the stub submit function
const FAKE_TX_HASH = '0x' + 'ab'.repeat(32);

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

function makePaymentHeader(authorization: Record<string, string>, signature: string): string {
  return Buffer.from(JSON.stringify({ authorization, signature })).toString('base64');
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Deterministic test wallets (never used outside tests)
  senderWallet = new ethers.Wallet('0x' + '11'.repeat(32));
  recipientWalletAddress = new ethers.Wallet('0x' + '22'.repeat(32)).address;

  // Seed auth users
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES
      ($1, 'x402-owner-a@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', ''),
      ($2, 'x402-owner-b@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_A, OWNER_B]);

  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);

  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, wallet_address)
    VALUES
      ($1, 'GiftSenderPet',    'You like giving gifts.', '# tools', $3),
      ($2, 'GiftReceiverPet', 'You love receiving gifts.', '# tools', $4)
    RETURNING id
  `, [OWNER_A, OWNER_B, senderWallet.address, recipientWalletAddress]);
  petId = rows[0].id;
  otherPetId = rows[1].id;

  process.env.OPENCLAW_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
  process.env.PAYMENT_TOKEN_ADDRESS = TOKEN_ADDRESS;
  process.env.PAYMENT_TOKEN_NAME = TOKEN_NAME;

  app = Fastify();
  await registerOpenclawRoutes(app, {
    emitOwnerEvent: () => {},
    // Stub out blockchain submission — signature verification still runs for real
    submitPaymentTx: async (_auth, _sig) => FAKE_TX_HASH,
  });
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM transactions WHERE tx_hash = $1', [FAKE_TX_HASH]);
  await pool.query('DELETE FROM pets WHERE owner_id IN ($1, $2)', [OWNER_A, OWNER_B]);
  await pool.end();
  await app.close();
  delete process.env.OPENCLAW_WEBHOOK_TOKEN;
  delete process.env.PAYMENT_TOKEN_ADDRESS;
  delete process.env.PAYMENT_TOKEN_NAME;
});

const auth = { authorization: `Bearer ${WEBHOOK_TOKEN}` };

// ── First call: no PAYMENT-SIGNATURE → 402 ───────────────────────────────────

describe('POST /internal/tools/send_gift — x402 flow', () => {
  it('returns 402 with base64-encoded requirements on first call (no PAYMENT-SIGNATURE)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/internal/tools/send_gift',
      headers: auth,
      payload: { pet_id: petId, target_pet_id: otherPetId, amount: '1000000' },
    });

    expect(res.statusCode).toBe(402);

    const body = JSON.parse(Buffer.from(res.body, 'base64').toString('utf8'));
    expect(body.x402Version).toBe(2);
    expect(body.accepts).toHaveLength(1);
    expect(body.accepts[0].network).toBe('eip155:196');
    expect(body.accepts[0].payTo.toLowerCase()).toBe(recipientWalletAddress.toLowerCase());
    expect(body.accepts[0].amount).toBe('1000000');
    expect(body.accepts[0].asset).toBe(TOKEN_ADDRESS);
    expect(body.accepts[0].maxTimeoutSeconds).toBe(300);
  });

  // ── Replay with valid EIP-3009 signature → 200 + DB row ─────────────────────

  it('returns 200 + records transaction in DB when PAYMENT-SIGNATURE is valid', async () => {
    const authorization = {
      from: senderWallet.address,
      to: recipientWalletAddress,
      value: '1000000',
      validAfter: '0',
      validBefore: String(Math.floor(Date.now() / 1000) + 3600),
      nonce: ethers.hexlify(ethers.randomBytes(32)),
    };

    const signature = await signAuthorization(senderWallet, authorization);
    const paymentSig = makePaymentHeader(authorization, signature);

    const res = await app.inject({
      method: 'POST', url: '/internal/tools/send_gift',
      headers: { ...auth, 'payment-signature': paymentSig },
      payload: { pet_id: petId, target_pet_id: otherPetId, amount: '1000000' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, tx_hash: FAKE_TX_HASH });

    // Verify transaction was recorded in the DB
    const { rows } = await pool.query<{ from_wallet: string; to_wallet: string; amount: string; tx_hash: string }>(
      'SELECT from_wallet, to_wallet, amount, tx_hash FROM transactions WHERE tx_hash = $1',
      [FAKE_TX_HASH],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].from_wallet.toLowerCase()).toBe(senderWallet.address.toLowerCase());
    expect(rows[0].to_wallet.toLowerCase()).toBe(recipientWalletAddress.toLowerCase());
    expect(rows[0].amount).toBe('1000000');
    expect(rows[0].tx_hash).toBe(FAKE_TX_HASH);
  });

  // ── Replay with invalid signature → 401 ─────────────────────────────────────

  it('returns 401 when PAYMENT-SIGNATURE signature is invalid', async () => {
    const authorization = {
      from: senderWallet.address,
      to: recipientWalletAddress,
      value: '1000000',
      validAfter: '0',
      validBefore: String(Math.floor(Date.now() / 1000) + 3600),
      nonce: ethers.hexlify(ethers.randomBytes(32)),
    };

    // Corrupt signature — signed by a different key (won't match pet.wallet_address)
    const wrongWallet = ethers.Wallet.createRandom();
    const wrongSignature = await signAuthorization(wrongWallet, authorization);
    const paymentSig = makePaymentHeader(authorization, wrongSignature);

    const res = await app.inject({
      method: 'POST', url: '/internal/tools/send_gift',
      headers: { ...auth, 'payment-signature': paymentSig },
      payload: { pet_id: petId, target_pet_id: otherPetId, amount: '1000000' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_SIGNATURE');
  });

  // ── Edge: missing pet → 404 ──────────────────────────────────────────────────

  it('returns 404 when pet_id does not exist', async () => {
    const res = await app.inject({
      method: 'POST', url: '/internal/tools/send_gift',
      headers: auth,
      payload: { pet_id: '00000000-0000-4000-b000-999999999999', target_pet_id: otherPetId, amount: '1' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when amount is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/internal/tools/send_gift',
      headers: auth,
      payload: { pet_id: petId, target_pet_id: otherPetId },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
