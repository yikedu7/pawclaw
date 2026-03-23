import { describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { createWallet, encryptPrivateKey, decryptPrivateKey } from '../wallet.js';

const TEST_KEY = '0'.repeat(64); // 32 zero bytes as hex

beforeEach(() => {
  process.env.WALLET_ENCRYPTION_KEY = TEST_KEY;
});

describe('encryptPrivateKey / decryptPrivateKey', () => {
  it('round-trips a private key', () => {
    const privateKey = '0x' + 'ab'.repeat(32);
    const encrypted = encryptPrivateKey(privateKey);
    expect(encrypted.split(':').length).toBe(3);
    expect(decryptPrivateKey(encrypted)).toBe(privateKey);
  });

  it('produces different ciphertexts for same key (random IV)', () => {
    const privateKey = '0x' + 'cd'.repeat(32);
    const a = encryptPrivateKey(privateKey);
    const b = encryptPrivateKey(privateKey);
    expect(a).not.toBe(b);
    expect(decryptPrivateKey(a)).toBe(privateKey);
    expect(decryptPrivateKey(b)).toBe(privateKey);
  });
});

describe('createWallet', () => {
  it('returns a valid Ethereum address', () => {
    const { address } = createWallet('pet-id-abc');
    expect(ethers.isAddress(address)).toBe(true);
  });

  it('is deterministic — same petId yields same address', () => {
    const a = createWallet('pet-id-abc');
    const b = createWallet('pet-id-abc');
    expect(a.address).toBe(b.address);
  });

  it('different petIds yield different addresses', () => {
    const a = createWallet('pet-id-001');
    const b = createWallet('pet-id-002');
    expect(a.address).not.toBe(b.address);
  });

  it('encryptedKey can be decrypted to the same wallet private key', () => {
    const { address, encryptedKey } = createWallet('pet-id-xyz');
    const recoveredKey = decryptPrivateKey(encryptedKey);
    const recovered = new ethers.Wallet(recoveredKey);
    expect(recovered.address).toBe(address);
  });
});
