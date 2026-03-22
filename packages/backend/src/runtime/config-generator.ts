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
 * - Model: claude-sonnet-4-6 (matches project LLM choice)
 * - Heartbeat every 5 min — ticks are driven externally via webhook ingress,
 *   heartbeat is a proactive fallback so pets act even without an explicit tick.
 * - Webhook ingress id matches petId so the tick loop can POST to /webhook/{petId}.
 * - Webhook egress delivers LLM turn results back to POST /internal/openclaw/events.
 */
export function generateConfigJson(input: ConfigInput): string {
  const { id: petId, backendUrl, webhookToken, gatewayToken } = input;
  const base = backendUrl.replace(/\/$/, '');

  const config = {
    model: 'claude-sonnet-4-6',
    gatewayToken,
    agents: {
      defaults: {
        heartbeat: {
          every: '5m',
          isolatedSession: true,
          lightContext: true,
          delivery: {
            mode: 'webhook',
            url: `${base}/internal/openclaw/events`,
            token: webhookToken,
          },
        },
      },
    },
    webhooks: [
      {
        id: petId,
        delivery: {
          mode: 'webhook',
          url: `${base}/internal/openclaw/events`,
          token: webhookToken,
        },
      },
    ],
  };

  return JSON.stringify(config, null, 2);
}
