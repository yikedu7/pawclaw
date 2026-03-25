import { describe, it, expect } from 'vitest';
import { generateHeartbeatMd } from './heartbeat-generator.js';

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
  it('includes a payment section before decision rules', () => {
    const out = generateHeartbeatMd(BASE_PET);
    const paymentIdx = out.indexOf('## Payment');
    const decisionIdx = out.indexOf('## Decision rules');
    expect(paymentIdx).toBeGreaterThanOrEqual(0);
    expect(decisionIdx).toBeGreaterThanOrEqual(0);
    expect(paymentIdx).toBeLessThan(decisionIdx);
  });

  it('includes curl POST to /internal/heartbeat/:petId with gateway token', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain(`/internal/heartbeat/${BASE_PET.petId}`);
    expect(out).toContain(BASE_PET.gatewayToken);
    expect(out).toContain(BASE_PET.backendUrl);
  });

  it('does NOT contain the old /internal/x402-settle endpoint', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).not.toContain('/internal/x402-settle');
  });

  it('does NOT contain hardcoded x402-pay onchainos parameters', () => {
    const out = generateHeartbeatMd(BASE_PET);
    // The new flow uses okx-x402-payment skill, not hardcoded x402-pay params
    expect(out).not.toMatch(/--network eip155:196.*--amount.*--pay-to.*--asset/s);
  });

  it('instructs pet to use okx-x402-payment skill to complete payment', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain('okx-x402-payment');
  });

  it('instructs pet to respond HEARTBEAT_OK if payment fails', () => {
    const out = generateHeartbeatMd(BASE_PET);
    // Payment failure fallback must appear in the payment section (before decision rules)
    const paymentSection = out.substring(out.indexOf('## Payment'), out.indexOf('## Stat thresholds'));
    expect(paymentSection).toMatch(/HEARTBEAT_OK/);
  });
});
