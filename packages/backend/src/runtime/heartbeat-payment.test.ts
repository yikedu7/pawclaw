import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateHeartbeatMd } from './heartbeat-generator.js';

const WALLET = '0xplatform-wallet-address';
const TOKEN_ADDRESS = '0xpaw-token-contract-address';

const BASE_PET = {
  name: 'Mochi',
  hunger: 70,
  mood: 65,
  affection: 50,
  petId: '00000000-0000-0000-0000-000000000001',
  gatewayToken: 'test-gateway-token',
  backendUrl: 'http://localhost:3001',
};

describe('generateHeartbeatMd — PAW payment block', () => {
  beforeEach(() => {
    process.env.PLATFORM_WALLET_ADDRESS = WALLET;
    process.env.PAYMENT_TOKEN_ADDRESS = TOKEN_ADDRESS;
  });

  afterEach(() => {
    delete process.env.PLATFORM_WALLET_ADDRESS;
    delete process.env.PAYMENT_TOKEN_ADDRESS;
  });

  it('includes a payment section before decision rules', () => {
    const out = generateHeartbeatMd(BASE_PET);
    const paymentIdx = out.indexOf('## Payment');
    const decisionIdx = out.indexOf('## Decision rules');
    expect(paymentIdx).toBeGreaterThanOrEqual(0);
    expect(decisionIdx).toBeGreaterThanOrEqual(0);
    expect(paymentIdx).toBeLessThan(decisionIdx);
  });

  it('includes x402-pay instruction with correct onchainos syntax', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/x402-pay/);
    expect(out).toMatch(/--network eip155:196/);
    expect(out).toMatch(/--amount 1000000000000000/);
    expect(out).toMatch(/--pay-to/);
    expect(out).toMatch(/--asset/);
  });

  it('uses PLATFORM_WALLET_ADDRESS from env when set', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain(WALLET);
  });

  it('uses PAYMENT_TOKEN_ADDRESS (paw contract) in the x402-pay command', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain(TOKEN_ADDRESS);
  });

  it('throws when PLATFORM_WALLET_ADDRESS is not set', () => {
    delete process.env.PLATFORM_WALLET_ADDRESS;
    expect(() => generateHeartbeatMd(BASE_PET)).toThrow('PLATFORM_WALLET_ADDRESS env var is required');
  });

  it('throws when PAYMENT_TOKEN_ADDRESS is not set', () => {
    delete process.env.PAYMENT_TOKEN_ADDRESS;
    expect(() => generateHeartbeatMd(BASE_PET)).toThrow('PAYMENT_TOKEN_ADDRESS env var is required');
  });

  it('instructs pet to respond HEARTBEAT_OK if payment fails', () => {
    const out = generateHeartbeatMd(BASE_PET);
    // Payment failure fallback must appear in the payment section (before decision rules)
    const paymentSection = out.substring(out.indexOf('## Payment'), out.indexOf('## Stat thresholds'));
    expect(paymentSection).toMatch(/HEARTBEAT_OK/);
  });

  it('includes curl POST to /internal/x402-settle with gateway token', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain('/internal/x402-settle');
    expect(out).toContain(BASE_PET.gatewayToken);
    expect(out).toContain(BASE_PET.petId);
    expect(out).toContain(BASE_PET.backendUrl);
  });
});
