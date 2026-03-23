import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateConfigJson } from './config-generator.js';

const GATEWAY_TOKEN = 'gw-token-xyz';

function parsed() {
  return JSON.parse(generateConfigJson({ gatewayToken: GATEWAY_TOKEN })) as Record<string, unknown>;
}

describe('generateConfigJson', () => {
  it('produces valid JSON', () => {
    assert.doesNotThrow(() => JSON.parse(generateConfigJson({ gatewayToken: GATEWAY_TOKEN })));
  });

  it('sets gateway.mode to local', () => {
    const cfg = parsed() as { gateway: { mode: string } };
    assert.equal(cfg.gateway.mode, 'local');
  });

  it('embeds gatewayToken under gateway.auth.token', () => {
    const cfg = parsed() as { gateway: { auth: { token: string } } };
    assert.equal(cfg.gateway.auth.token, GATEWAY_TOKEN);
  });

  it('sets heartbeat every 5m', () => {
    const cfg = parsed() as { agents: { defaults: { heartbeat: { every: string } } } };
    assert.equal(cfg.agents.defaults.heartbeat.every, '5m');
  });

  it('sets heartbeat lightContext to true', () => {
    const cfg = parsed() as { agents: { defaults: { heartbeat: { lightContext: boolean } } } };
    assert.equal(cfg.agents.defaults.heartbeat.lightContext, true);
  });

  it('does not include invalid keys (model, webhooks, isolatedSession, delivery)', () => {
    const raw = generateConfigJson({ gatewayToken: GATEWAY_TOKEN });
    assert.doesNotMatch(raw, /"model"/);
    assert.doesNotMatch(raw, /"webhooks"/);
    assert.doesNotMatch(raw, /"isolatedSession"/);
    assert.doesNotMatch(raw, /"delivery"/);
  });
});
