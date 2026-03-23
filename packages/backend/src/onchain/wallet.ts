/**
 * Onchain wallet module — ethers.js HD wallet fallback (docs/risks.md R3)
 *
 * Derives a deterministic Ethereum wallet for each pet using HMAC-SHA256 of
 * petId with WALLET_ENCRYPTION_KEY as the HMAC key.  Private keys are stored
 * AES-256-GCM encrypted in pets.wallet_encrypted_key.
 */

import crypto from 'node:crypto';
import { ethers } from 'ethers';

const X_LAYER_TESTNET_RPC = process.env.X_LAYER_RPC_URL ?? 'https://testrpc.xlayer.tech';

// Minimal ERC-20 ABI — only the methods we need
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// ── Encryption helpers ────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const raw = process.env.WALLET_ENCRYPTION_KEY;
  if (!raw) throw new Error('WALLET_ENCRYPTION_KEY environment variable is required');
  // Accept hex (64 chars) or base64 (44 chars) 32-byte key
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('WALLET_ENCRYPTION_KEY must be 32 bytes (hex or base64)');
  return buf;
}

export function encryptPrivateKey(privateKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ct = cipher.update(privateKey, 'utf8', 'hex');
  ct += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  // Format: iv:tag:ciphertext  (all hex)
  return `${iv.toString('hex')}:${tag}:${ct}`;
}

export function decryptPrivateKey(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted key format');
  const [ivHex, tagHex, ct] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let plain = decipher.update(ct, 'hex', 'utf8');
  plain += decipher.final('utf8');
  return plain;
}

// ── Deterministic key derivation ──────────────────────────────────────────────

function derivePrivateKey(petId: string): string {
  const key = getEncryptionKey();
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(`x-pet-wallet:${petId}`);
  return '0x' + hmac.digest('hex');
}

// ── Public interface ──────────────────────────────────────────────────────────

export type WalletInfo = {
  address: string;
  encryptedKey: string;
};

/**
 * Derive a deterministic wallet for a pet and return its address plus
 * the AES-256-GCM encrypted private key for storage.
 */
export function createWallet(petId: string): WalletInfo {
  const privateKey = derivePrivateKey(petId);
  const wallet = new ethers.Wallet(privateKey);
  const encryptedKey = encryptPrivateKey(privateKey);
  return { address: wallet.address, encryptedKey };
}

/**
 * Transfer native token (OKB) or ERC-20 token from one pet wallet to another.
 * `encryptedKey` is the stored encrypted private key for the `from` address.
 * Returns the transaction hash.
 */
export async function transfer(
  encryptedKey: string,
  to: string,
  token: string,
  amount: string,
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(X_LAYER_TESTNET_RPC);
  const privateKey = decryptPrivateKey(encryptedKey);
  const signer = new ethers.Wallet(privateKey, provider);

  const isNative = token === 'OKB' || token === 'ETH';

  if (isNative) {
    const tx = await signer.sendTransaction({
      to,
      value: ethers.parseEther(amount),
    });
    return tx.hash;
  }

  // ERC-20: `token` is the contract address
  const contract = new ethers.Contract(token, ERC20_ABI, signer);
  const decimals: number = await contract.decimals();
  const parsed = ethers.parseUnits(amount, decimals);
  const tx = await contract.transfer(to, parsed);
  return tx.hash;
}

/**
 * Get the balance of an address for a given token.
 * Returns balance as a decimal string (e.g. "1.5").
 */
export async function getBalance(address: string, token: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(X_LAYER_TESTNET_RPC);

  const isNative = token === 'OKB' || token === 'ETH';

  if (isNative) {
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  const contract = new ethers.Contract(token, ERC20_ABI, provider);
  const [balance, decimals]: [bigint, number] = await Promise.all([
    contract.balanceOf(address),
    contract.decimals(),
  ]);
  return ethers.formatUnits(balance, decimals);
}
