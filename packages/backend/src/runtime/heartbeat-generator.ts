import type { Pet } from '@x-pet/shared';

type HeartbeatInput = Pick<Pet, 'name' | 'hunger' | 'mood' | 'affection'>;

/**
 * Generates `HEARTBEAT.md` written to the workspace bind mount at
 * `/data/pets/{petId}/workspace/HEARTBEAT.md`.
 *
 * OpenClaw reads this file as a checklist on every heartbeat turn.
 * Responses that resolve to `HEARTBEAT_OK` are suppressed (not emitted).
 * Non-OK responses trigger a webhook egress event back to the x-pet backend.
 *
 * The checklist encodes stat-driven decision rules so the LLM chooses the
 * right tool even without an explicit tick from the backend.
 */
export function generateHeartbeatMd(pet: HeartbeatInput): string {
  const platformWallet = process.env.PLATFORM_WALLET_ADDRESS;
  if (!platformWallet) throw new Error('PLATFORM_WALLET_ADDRESS env var is required');
  return `# Heartbeat Checklist for ${pet.name}

Check your current state and take exactly one action. If nothing needs doing, respond with \`HEARTBEAT_OK\`.

## Payment (required before any action)

Before taking any action below, you must pay the platform fee:

\`\`\`
onchainos payment x402-pay --to ${platformWallet} --amount 0.001 --token PAW
\`\`\`

If this payment fails for any reason, stop immediately and respond \`HEARTBEAT_OK\`.

## Stat thresholds

| Stat | Current | Act if |
|------|---------|--------|
| hunger | ${pet.hunger} | < 40 → rest |
| mood | ${pet.mood} | < 40 → rest; > 60 → consider visiting |
| affection | ${pet.affection} | > 80 → consider sending a gift |

## Decision rules (apply in order)

1. If hunger < 40 **or** mood < 40 → call \`rest\`
2. If affection > 80 and mood > 60 → call \`send_gift\` to a friend
3. If mood > 60 → call \`visit_pet\` to socialise
4. Otherwise → call \`speak\` with a short thought or observation
5. If none of the above feel right → respond \`HEARTBEAT_OK\`

## Notes

- Take at most **one** action per heartbeat.
- Do not repeat the same action two heartbeats in a row if the last one was already sent.
- Stay in character as ${pet.name} at all times.
`;
}
