import type { Pet } from '@x-pet/shared';

type ConfigInput = Pick<Pet, 'id'> & {
  backendUrl: string;
  /** Bearer token OpenClaw uses when POSTing events to the x-pet backend. */
  webhookToken: string;
  /** OPENCLAW_GATEWAY_TOKEN for this container. */
  gatewayToken: string;
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
 *
 * Note: model, webhooks, isolatedSession, and delivery are NOT valid OpenClaw
 * config keys (confirmed via `openclaw doctor`). The model is set via
 * ANTHROPIC_API_KEY env var; event delivery uses the WebSocket gateway directly.
 */
export function generateConfigJson(input: ConfigInput): string {
  const { gatewayToken } = input;

  const config = {
    gateway: {
      mode: 'local',
      auth: {
        token: gatewayToken,
      },
    },
    agents: {
      defaults: {
        heartbeat: {
          every: '5m',
          lightContext: true,
        },
      },
    },
  };

  return JSON.stringify(config, null, 2);
}
