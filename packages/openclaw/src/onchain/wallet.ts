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
 * AK login (no email = uses OKX_API_KEY/SECRET/PASSPHRASE from env),
 * then fetch X Layer wallet address from `wallet addresses`.
 * Skips login if a session is already active.
 */
async function onchainLogin(): Promise<string> {
  // Check if already logged in to avoid redundant login calls
  try {
    const { stdout: statusOut } = await execFileAsync('onchainos', ['wallet', 'status'], { timeout: 10_000 });
    const status = JSON.parse(statusOut) as { ok: boolean; data?: { loggedIn?: boolean } };
    if (!status.data?.loggedIn) {
      await execFileAsync('onchainos', ['wallet', 'login'], { timeout: 30_000 });
    }
  } catch {
    await execFileAsync('onchainos', ['wallet', 'login'], { timeout: 30_000 });
  }
  const { stdout } = await execFileAsync('onchainos', ['wallet', 'addresses'], { timeout: 15_000 });
  const data = JSON.parse(stdout) as {
    ok: boolean;
    data: { xlayer?: Array<{ address: string; chainIndex: string }> };
  };
  const address = data.data?.xlayer?.[0]?.address;
  if (!address) throw new Error(`onchainos wallet addresses: no X Layer address in output`);
  return address;
}

/**
 * Native OKB transfer via `wallet send` on X Layer (chain 196).
 * `amount` is in UI units (e.g. "0.1" for 0.1 OKB).
 * For ERC-20, pass the contract address as `token`.
 */
async function onchainSend(to: string, token: string, amount: string): Promise<string> {
  const args = [
    'wallet', 'send',
    '--receipt', to,
    '--amount', amount,
    '--chain', '196',
  ];
  if (token !== 'OKB') {
    args.push('--contract-token', token);
  }
  const { stdout } = await execFileAsync('onchainos', args, { timeout: 60_000 });
  const data = JSON.parse(stdout) as { ok: boolean; data?: { orderId?: string; txHash?: string } };
  const txHash = data.data?.txHash ?? data.data?.orderId;
  if (!txHash) throw new Error(`onchainos wallet send: no txHash in output: ${stdout}`);
  return txHash;
}

/**
 * Query native OKB balance on X Layer (chain 196).
 */
async function onchainGetBalance(): Promise<string> {
  const { stdout } = await execFileAsync(
    'onchainos',
    ['wallet', 'balance', '--chain', '196'],
    { timeout: 15_000 },
  );
  const data = JSON.parse(stdout) as {
    ok: boolean;
    data?: { details?: Array<{ tokenAssets: Array<{ symbol: string; balance: string }> }> };
  };
  const assets = data.data?.details?.[0]?.tokenAssets ?? [];
  const okb = assets.find((a) => a.symbol === 'OKB');
  return okb?.balance ?? '0';
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
      const address = await onchainLogin();
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
      return await onchainSend(to, token, amount);
    } catch (err) {
      console.warn(`[wallet] onchainos wallet send failed: ${err}. Falling back to ethers.js`);
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
      return await onchainGetBalance();
    } catch (err) {
      console.warn(`[wallet] onchainos balance failed: ${err}. Falling back to ethers.js`);
    }
  }
  const provider = new ethers.JsonRpcProvider(X_LAYER_TESTNET_RPC);
  const balance = await provider.getBalance(address);
  return ethers.formatEther(balance);
}
