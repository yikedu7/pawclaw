import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateConfigJson } from './config-generator.js';

const BASE = 'https://x-pet-backend.railway.app';
const PET_ID = '00000000-0000-0000-0000-000000000001';
const WEBHOOK_TOKEN = 'wh-token-abc';
const GATEWAY_TOKEN = 'gw-token-xyz';

function parsed(overrides: Partial<Parameters<typeof generateConfigJson>[0]> = {}) {
  const raw = generateConfigJson({
    id: PET_ID,
    backendUrl: BASE,
    webhookToken: WEBHOOK_TOKEN,
    gatewayToken: GATEWAY_TOKEN,
    ...overrides,
  });
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('generateConfigJson', () => {
  it('produces valid JSON', () => {
    const raw = generateConfigJson({ id: PET_ID, backendUrl: BASE, webhookToken: WEBHOOK_TOKEN, gatewayToken: GATEWAY_TOKEN });
    assert.doesNotThrow(() => JSON.parse(raw));
  });

  it('sets model to claude-sonnet-4-6', () => {
    assert.equal((parsed() as { model: string }).model, 'claude-sonnet-4-6');
  });

  it('embeds gatewayToken', () => {
    assert.equal((parsed() as { gatewayToken: string }).gatewayToken, GATEWAY_TOKEN);
  });

  it('sets heartbeat every 5m', () => {
    const cfg = parsed() as { agents: { defaults: { heartbeat: { every: string } } } };
    assert.equal(cfg.agents.defaults.heartbeat.every, '5m');
  });

  it('heartbeat delivery targets /internal/openclaw/events', () => {
    const cfg = parsed() as { agents: { defaults: { heartbeat: { delivery: { url: string } } } } };
    assert.match(cfg.agents.defaults.heartbeat.delivery.url, /\/internal\/openclaw\/events$/);
  });

  it('heartbeat delivery carries webhookToken', () => {
    const cfg = parsed() as { agents: { defaults: { heartbeat: { delivery: { token: string } } } } };
    assert.equal(cfg.agents.defaults.heartbeat.delivery.token, WEBHOOK_TOKEN);
  });

  it('webhook ingress id matches petId', () => {
    const cfg = parsed() as { webhooks: Array<{ id: string }> };
    assert.equal(cfg.webhooks[0].id, PET_ID);
  });

  it('webhook egress targets /internal/openclaw/events', () => {
    const cfg = parsed() as { webhooks: Array<{ delivery: { url: string } }> };
    assert.match(cfg.webhooks[0].delivery.url, /\/internal\/openclaw\/events$/);
  });

  it('strips trailing slash from backendUrl', () => {
    const raw = generateConfigJson({ id: PET_ID, backendUrl: BASE + '/', webhookToken: WEBHOOK_TOKEN, gatewayToken: GATEWAY_TOKEN });
    assert.doesNotMatch(raw, /railway\.app\/\//);
  });
});
