/**
 * Onchain wallet module — onchainos CLI wrapper with ethers.js HD wallet fallback.
 *
 * Primary path: delegates to the `onchainos` CLI (OKX Onchain OS) running inside
 * the OpenClaw container. The CLI reads OKX_API_KEY / OKX_SECRET_KEY /
 * OKX_PASSPHRASE from the environment.
 *
 * Fallback (docs/risks.md R3): if the onchainos binary is not on PATH, derives
 * an HD wallet deterministically from petId using ethers.js + HMAC-SHA256.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { ethers } from 'ethers';

const execFileAsync = promisify(execFile);

const X_LAYER_TESTNET_RPC = process.env.X_LAYER_RPC_URL ?? 'https://testrpc.xlayer.tech';
const X_LAYER_CAIP2 = 'eip155:196';

// ── onchainos availability ────────────────────────────────────────────────────

async function isOnchainOsAvailable(): Promise<boolean> {
  try {
    await execFileAsync('onchainos', ['--version'], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// ── onchainos CLI wrappers ────────────────────────────────────────────────────

/**
 * Register pet identity with onchainos and return its wallet address.
 * Reads OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE from process.env.
 */
async function onchainLogin(petId: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'onchainos',
    ['wallet', 'login', '--identity', `pet-${petId}`],
    { timeout: 30_000 },
  );
  const match = stdout.match(/0x[0-9a-fA-F]{40}/);
  if (!match) throw new Error(`onchainos wallet login: no address in output: ${stdout}`);
  return match[0];
}

/**
 * X402 micropayment via onchainos for pet-to-pet gifts on X Layer.
 * `amountWei` must be in minimal (wei) units.
 */
async function onchainX402Pay(to: string, asset: string, amountWei: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'onchainos',
    [
      'payment', 'x402-pay',
      '--network', X_LAYER_CAIP2,
      '--amount', amountWei,
      '--pay-to', to,
      '--asset', asset,
    ],
    { timeout: 60_000 },
  );
  const match = stdout.match(/0x[0-9a-fA-F]{64}/);
  if (!match) throw new Error(`onchainos x402-pay: no txHash in output: ${stdout}`);
  return match[0];
}

/**
 * Query native OKB balance for an address on X Layer (chain 196).
 */
async function onchainGetBalance(address: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'onchainos',
    ['wallet', 'balance', '--chain', '196', '--address', address],
    { timeout: 15_000 },
  );
  const match = stdout.match(/[\d]+\.?[\d]*/);
  return match ? match[0] : '0';
}

// ── Ethers.js HD wallet fallback ─────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const raw = process.env.WALLET_ENCRYPTION_KEY;
  if (!raw) throw new Error('WALLET_ENCRYPTION_KEY environment variable is required');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('WALLET_ENCRYPTION_KEY must be 32 bytes (hex or base64)');
  return buf;
}

function derivePrivateKey(petId: string): string {
  const key = getEncryptionKey();
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(`x-pet-wallet:${petId}`);
  return '0x' + hmac.digest('hex');
}

// ── Public interface ──────────────────────────────────────────────────────────

export type WalletInfo = {
  address: string;
  /** 'onchainos' = OKX Onchain OS; 'ethers' = HD wallet fallback */
  provider: 'onchainos' | 'ethers';
};

/**
 * Register or derive a wallet for a pet.
 * Tries onchainos CLI first; falls back to ethers.js HD derivation (docs/risks.md R3).
 */
export async function createWallet(petId: string): Promise<WalletInfo> {
  if (await isOnchainOsAvailable()) {
    try {
      const address = await onchainLogin(petId);
      return { address, provider: 'onchainos' };
    } catch (err) {
      console.warn(`[wallet] onchainos login failed for pet ${petId}: ${err}. Falling back to ethers.js`);
    }
  }
  const privateKey = derivePrivateKey(petId);
  const wallet = new ethers.Wallet(privateKey);
  return { address: wallet.address, provider: 'ethers' };
}

/**
 * Transfer token from pet wallet to recipient on X Layer.
 * Uses onchainos x402-pay if available; falls back to ethers.js direct transfer.
 * `amount` is in UI units (e.g. "0.1" for 0.1 OKB).
 * `token` is "OKB" for native or an ERC-20 contract address.
 */
export async function transfer(
  from: string,
  to: string,
  token: string,
  amount: string,
): Promise<string> {
  if (await isOnchainOsAvailable()) {
    try {
      const amountWei = ethers.parseEther(amount).toString();
      return await onchainX402Pay(to, token, amountWei);
    } catch (err) {
      console.warn(`[wallet] onchainos x402-pay failed: ${err}. Falling back to ethers.js`);
    }
  }
  // Fallback: `from` is treated as petId to derive the private key
  const provider = new ethers.JsonRpcProvider(X_LAYER_TESTNET_RPC);
  const privateKey = derivePrivateKey(from);
  const signer = new ethers.Wallet(privateKey, provider);
  const tx = await signer.sendTransaction({ to, value: ethers.parseEther(amount) });
  return tx.hash;
}

/**
 * Get native OKB balance for an address on X Layer.
 * `token` is reserved for future ERC-20 support.
 */
export async function getBalance(address: string, _token: string): Promise<string> {
  if (await isOnchainOsAvailable()) {
    try {
      return await onchainGetBalance(address);
    } catch (err) {
      console.warn(`[wallet] onchainos balance failed: ${err}. Falling back to ethers.js`);
    }
  }
  const provider = new ethers.JsonRpcProvider(X_LAYER_TESTNET_RPC);
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
}
