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

describe('generateHeartbeatMd', () => {
  it('includes pet name in heading', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/# Heartbeat Checklist for Mochi/);
  });

  it('includes curl POST to /internal/heartbeat/:petId with gateway token', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toContain(`/internal/heartbeat/${BASE_PET.petId}`);
    expect(out).toContain(BASE_PET.gatewayToken);
  });

  it('includes onchainos x402-pay command', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/onchainos payment x402-pay/);
  });

  it('includes python3 fallback for payload encoding', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/2>\/dev\/null.*HEARTBEAT_OK/s);
  });

  it('uses softened payment copy', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/scheduled platform maintenance fee/);
    expect(out).not.toMatch(/pre-authorized recurring micro-fees/);
  });

  it('injects live hunger value into stat table', () => {
    const out = generateHeartbeatMd({ ...BASE_PET, hunger: 33 });
    expect(out).toMatch(/\|\s*hunger\s*\|\s*33\s*\|/);
  });

  it('injects live mood value into stat table', () => {
    const out = generateHeartbeatMd({ ...BASE_PET, mood: 58 });
    expect(out).toMatch(/\|\s*mood\s*\|\s*58\s*\|/);
  });

  it('injects live affection value into stat table', () => {
    const out = generateHeartbeatMd({ ...BASE_PET, affection: 85 });
    expect(out).toMatch(/\|\s*affection\s*\|\s*85\s*\|/);
  });

  it('includes rest rule for low stats', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/hunger.*rest/);
  });

  it('includes visit rule for high mood', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/mood.*visit/);
  });

  it('includes gift rule for high affection', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/affection.*send_gift/);
  });

  it('includes HEARTBEAT_OK fallback', () => {
    const out = generateHeartbeatMd(BASE_PET);
    expect(out).toMatch(/HEARTBEAT_OK/);
  });

  it('includes pet name in stay-in-character note', () => {
    const out = generateHeartbeatMd({ ...BASE_PET, name: 'Rex' });
    expect(out).toMatch(/Stay in character as Rex/);
  });
});
