type ConfigInput = {
  /** OPENCLAW_GATEWAY_TOKEN — set in config and passed as container env var. */
  gatewayToken: string;
  /**
   * Optional custom OpenAI-compatible base URL (e.g. https://aihubmix.com/v1).
   * When set, a custom provider "aihub" is registered using api: "openai-completions"
   * and the model is pinned to DeepSeek-V3.1, which reliably executes shell commands
   * without safety refusals (Claude refuses autonomous financial transactions).
   */
  anthropicBaseUrl?: string;
};

/**
 * Generates the `openclaw.json` config written to the config bind mount at
 * `/data/pets/{petId}/config/openclaw.json` (maps to `/home/node/.openclaw/openclaw.json`).
 *
 * Key decisions:
 * - gateway.mode = local — required for the gateway to start in a container.
 * - gateway.auth.token = gatewayToken — bearer token for backend → container comms.
 * - Model: DeepSeek-V3.1 via aihub (openai-completions API) — executes onchainos
 *   shell commands without refusals. Claude models refuse x402 payment steps.
 * - Heartbeat every 3h — OpenClaw proactive fallback between backend ticks.
 */
export function generateConfigJson({ gatewayToken, anthropicBaseUrl }: ConfigInput): string {
  // Always use DeepSeek-V3.1 via the aihub proxy (openai-completions).
  // The base URL for openai-completions must end in /v1.
  const baseUrl = anthropicBaseUrl
    ? (anthropicBaseUrl.endsWith('/v1') ? anthropicBaseUrl : `${anthropicBaseUrl}/v1`)
    : 'https://aihubmix.com/v1';

  const model = process.env.LLM_MODEL ?? 'minimax-m2.7';

  const config = {
    gateway: {
      mode: 'local',
      auth: { token: gatewayToken },
      http: { endpoints: { chatCompletions: { enabled: true } } },
    },
    agents: {
      defaults: {
        model: `aihub/${model}`,
        heartbeat: { every: '3h' },
      },
    },
    models: {
      mode: 'merge',
      providers: {
        aihub: {
          baseUrl,
          apiKey: '${ANTHROPIC_API_KEY}',
          api: 'openai-completions',
          models: [{ id: model, name: model }],
        },
      },
    },
  };

  return JSON.stringify(config, null, 2);
}
