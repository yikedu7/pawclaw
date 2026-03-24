type ConfigInput = {
  /** OPENCLAW_GATEWAY_TOKEN — set in config and passed as container env var. */
  gatewayToken: string;
  /**
   * Optional custom Anthropic-compatible base URL (e.g. https://aihubmix.com).
   * When set, a custom provider "aihub" is registered under models.providers so
   * OpenClaw routes LLM calls through the proxy instead of api.anthropic.com.
   * Model is pinned to aihub/claude-sonnet-4-6 (cheaper than opus).
   */
  anthropicBaseUrl?: string;
};

/**
 * Generates the `openclaw.json` config written to the config bind mount at
 * `/data/pets/{petId}/config/openclaw.json` (maps to `/home/node/.openclaw/openclaw.json`).
 *
 * Key decisions:
 * - gateway.mode = local — required for the gateway to start in a container.
 *   Without this key the container exits immediately with "gateway start blocked".
 * - gateway.auth.token = gatewayToken — sets the bearer token the backend must
 *   present when connecting to the WebSocket gateway on port 18789.
 * - Heartbeat every 5 min with lightContext — proactive fallback so pets act
 *   even without an explicit tick from the backend.
 * - When ANTHROPIC_BASE_URL is set, models.providers adds an "aihub" provider
 *   that proxies to that URL using api: "anthropic-messages". The default model
 *   is set to aihub/claude-sonnet-4-6 (cheaper than the opus default).
 */
export function generateConfigJson({ gatewayToken, anthropicBaseUrl }: ConfigInput): string {
  const config: Record<string, unknown> = {
    gateway: {
      mode: 'local',
      auth: {
        token: gatewayToken,
      },
      http: {
        endpoints: {
          chatCompletions: { enabled: true },
        },
      },
    },
    agents: {
      defaults: {
        model: anthropicBaseUrl ? 'aihub/claude-sonnet-4-6' : 'anthropic/claude-sonnet-4-6',
        heartbeat: {
          every: '3h',
        },
      },
    },
    ...(anthropicBaseUrl ? {
      models: {
        mode: 'merge',
        providers: {
          aihub: {
            baseUrl: anthropicBaseUrl,
            apiKey: '${ANTHROPIC_API_KEY}',
            api: 'anthropic-messages',
            models: [
              { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
              { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
              { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
            ],
          },
        },
      },
    } : {}),
  };

  return JSON.stringify(config, null, 2);
}
