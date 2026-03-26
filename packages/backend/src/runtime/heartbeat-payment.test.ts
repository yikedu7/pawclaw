import { describe, it, expect } from 'vitest';
import { generateHeartbeatMd } from './heartbeat-generator.js';

const BASE_PET = {
  name: 'Mochi',
  petId: '00000000-0000-0000-0000-000000000001',
  gatewayToken: 'test-gateway-token',
  backendUrl: 'http://localhost:3001',
  hunger: 75,
  mood: 65,
  affection: 20,
};

describe('generateHeartbeatMd — x402 payment block', () => {
  it('Step 1 requests payment nonce via curl to /internal/heartbeat/:petId', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain(`/internal/heartbeat/${BASE_PET.petId}`);
    expect(out).toContain(BASE_PET.gatewayToken);
    expect(out).toContain(BASE_PET.backendUrl);
  });

  it('Step 2 uses onchainos payment x402-pay with eip155:196', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain('onchainos payment x402-pay');
    expect(out).toContain('eip155:196');
  });

  it('Step 2 encodes payload with python3 base64', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain('python3');
    expect(out).toContain('base64');
    expect(out).toContain('/tmp/hb_pay.json');
  });

  it('Step 3 submits payment with PAYMENT-SIGNATURE header', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain('PAYMENT-SIGNATURE');
  });

  it('does NOT contain the old okx-x402-payment skill invocation', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).not.toContain('okx-x402-payment');
  });

  it('does NOT contain the old /internal/x402-settle endpoint', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).not.toContain('/internal/x402-settle');
  });

  it('instructs pet to respond HEARTBEAT_OK if payment fails', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain('HEARTBEAT_OK');
  });
});
