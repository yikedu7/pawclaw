import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateHeartbeatMd } from './heartbeat-generator.js';

const BASE_PET = { name: 'Mochi', hunger: 70, mood: 65, affection: 50 };

describe('generateHeartbeatMd', () => {
  it('includes pet name in heading', () => {
    const out = generateHeartbeatMd(BASE_PET);
    assert.match(out, /# Heartbeat Checklist for Mochi/);
  });

  it('shows current hunger stat', () => {
    const out = generateHeartbeatMd(BASE_PET);
    assert.match(out, /hunger \| 70/);
  });

  it('shows current mood stat', () => {
    const out = generateHeartbeatMd(BASE_PET);
    assert.match(out, /mood \| 65/);
  });

  it('shows current affection stat', () => {
    const out = generateHeartbeatMd(BASE_PET);
    assert.match(out, /affection \| 50/);
  });

  it('includes rest rule for low stats', () => {
    const out = generateHeartbeatMd(BASE_PET);
    assert.match(out, /hunger < 40.*rest/);
  });

  it('includes visit rule for high mood', () => {
    const out = generateHeartbeatMd(BASE_PET);
    assert.match(out, /mood > 60.*visit_pet/);
  });

  it('includes gift rule for high affection', () => {
    const out = generateHeartbeatMd(BASE_PET);
    assert.match(out, /affection > 80.*send_gift/);
  });

  it('includes HEARTBEAT_OK fallback', () => {
    const out = generateHeartbeatMd(BASE_PET);
    assert.match(out, /HEARTBEAT_OK/);
  });

  it('includes pet name in stay-in-character note', () => {
    const out = generateHeartbeatMd({ ...BASE_PET, name: 'Rex' });
    assert.match(out, /Stay in character as Rex/);
  });
});
