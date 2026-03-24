import { describe, it, expect, afterEach } from 'vitest';
import { generateHeartbeatMd } from './heartbeat-generator.js';

const BASE_PET = { name: 'Mochi', hunger: 70, mood: 65, affection: 50 };

describe('generateHeartbeatMd — PAW payment block', () => {
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
    process.env.PLATFORM_WALLET_ADDRESS = '0xdeadbeef1234';
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain('0xdeadbeef1234');
  });

  it('falls back to zero address when PLATFORM_WALLET_ADDRESS is not set', () => {
    delete process.env.PLATFORM_WALLET_ADDRESS;
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain('0x0000000000000000000000000000000000000000');
  });

  it('instructs pet to respond HEARTBEAT_OK if payment fails', () => {
    const out = generateHeartbeatMd(BASE_PET);
    // Payment failure fallback must appear in the payment section (before decision rules)
    const paymentSection = out.substring(out.indexOf('## Payment'), out.indexOf('## Stat thresholds'));
    expect(paymentSection).toMatch(/HEARTBEAT_OK/);
  });
});
