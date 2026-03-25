import { describe, it, expect } from 'vitest';
import { generateConfigJson } from './config-generator.js';

const GATEWAY_TOKEN = 'gw-token-xyz';

function parsed(opts?: { anthropicBaseUrl?: string }) {
  return JSON.parse(generateConfigJson({ gatewayToken: GATEWAY_TOKEN, ...opts })) as Record<string, unknown>;
}

describe('generateConfigJson', () => {
  it('produces valid JSON', () => {
    expect(() => JSON.parse(generateConfigJson({ gatewayToken: GATEWAY_TOKEN }))).not.toThrow();
  });

  it('sets gateway.mode to local', () => {
    const cfg = parsed() as { gateway: { mode: string } };
    expect(cfg.gateway.mode).toBe('local');
  });

  it('embeds gatewayToken under gateway.auth.token', () => {
    const cfg = parsed() as { gateway: { auth: { token: string } } };
    expect(cfg.gateway.auth.token).toBe(GATEWAY_TOKEN);
  });

  it('enables chatCompletions endpoint', () => {
    const cfg = parsed() as { gateway: { http: { endpoints: { chatCompletions: { enabled: boolean } } } } };
    expect(cfg.gateway.http.endpoints.chatCompletions.enabled).toBe(true);
  });

  it('sets heartbeat every 3h', () => {
    const cfg = parsed() as { agents: { defaults: { heartbeat: { every: string } } } };
    expect(cfg.agents.defaults.heartbeat.every).toBe('3h');
  });

  it('uses DeepSeek-V3.1 model', () => {
    const cfg = parsed() as { agents: { defaults: { model: string } } };
    expect(cfg.agents.defaults.model).toBe('aihub/DeepSeek-V3.1');
  });

  it('uses openai-completions API type', () => {
    const cfg = parsed() as { models: { providers: { aihub: { api: string } } } };
    expect(cfg.models.providers.aihub.api).toBe('openai-completions');
  });

  it('appends /v1 to base URL when missing', () => {
    const cfg = parsed({ anthropicBaseUrl: 'https://aihubmix.com' }) as { models: { providers: { aihub: { baseUrl: string } } } };
    expect(cfg.models.providers.aihub.baseUrl).toBe('https://aihubmix.com/v1');
  });

  it('does not duplicate /v1 when already present', () => {
    const cfg = parsed({ anthropicBaseUrl: 'https://aihubmix.com/v1' }) as { models: { providers: { aihub: { baseUrl: string } } } };
    expect(cfg.models.providers.aihub.baseUrl).toBe('https://aihubmix.com/v1');
  });

  it('does not include webhooks, isolatedSession, or delivery keys', () => {
    const raw = generateConfigJson({ gatewayToken: GATEWAY_TOKEN });
    expect(raw).not.toContain('"webhooks"');
    expect(raw).not.toContain('"isolatedSession"');
    expect(raw).not.toContain('"delivery"');
  });
});
