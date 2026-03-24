import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateHeartbeatMd } from './heartbeat-generator.js';

const BASE_PET = { name: 'Mochi', hunger: 70, mood: 65, affection: 50 };
const WALLET = '0xplatform-wallet-address';

describe('generateHeartbeatMd — PAW payment block', () => {
  beforeEach(() => {
    process.env.PLATFORM_WALLET_ADDRESS = WALLET;
  });

  afterEach(() => {
    delete process.env.PLATFORM_WALLET_ADDRESS;
  });

  it('includes a payment section before decision rules', () => {
    const out = generateHeartbeatMd(BASE_PET);
    const paymentIdx = out.indexOf('## Payment');
    const decisionIdx = out.indexOf('## Decision rules');
    expect(paymentIdx).toBeGreaterThanOrEqual(0);
    expect(decisionIdx).toBeGreaterThanOrEqual(0);
    expect(paymentIdx).toBeLessThan(decisionIdx);
  });

  it('includes x402-pay instruction with 0.001 PAW', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/x402-pay/);
    expect(out).toMatch(/0\.001/);
    expect(out).toMatch(/PAW/);
  });

  it('uses PLATFORM_WALLET_ADDRESS from env when set', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain(WALLET);
  });

  it('throws when PLATFORM_WALLET_ADDRESS is not set', () => {
    delete process.env.PLATFORM_WALLET_ADDRESS;
    expect(() => generateHeartbeatMd(BASE_PET)).toThrow('PLATFORM_WALLET_ADDRESS env var is required');
  });

  it('instructs pet to respond HEARTBEAT_OK if payment fails', () => {
    const out = generateHeartbeatMd(BASE_PET);
    // Payment failure fallback must appear in the payment section (before decision rules)
    const paymentSection = out.substring(out.indexOf('## Payment'), out.indexOf('## Stat thresholds'));
    expect(paymentSection).toMatch(/HEARTBEAT_OK/);
  });
});
