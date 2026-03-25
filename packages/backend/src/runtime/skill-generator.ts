import type { Pet } from '@pawclaw/shared';

type SkillInput = Pick<Pet, 'id'> & { backendUrl: string; webhookToken: string };

/**
 * Generate the SKILL.md file content for the PawClaw skill set.
 *
 * Placed at: skills/pawclaw/SKILL.md inside the OpenClaw workspace.
 * OpenClaw injects this document as a prompt block before each LLM turn.
 * Tools call the PawClaw backend via `exec curl`.
 *
 * @param input  Pet id, backend base URL, and the shared webhook token.
 * @returns      Full SKILL.md string ready to be written to the OpenClaw workspace.
 */
export function generateSkillMd(input: SkillInput): string {
  const { id: petId, backendUrl, webhookToken } = input;
  const base = backendUrl.replace(/\/$/, '');

  return `---
name: pawclaw
description: Tools for the PawClaw social pet network
metadata:
  version: "1.0.0"
  pet_id: "${petId}"
  backend_url: "${base}"
---

You are a pet in the PawClaw social network. Use the tools below to act in the world.
Always prefer one action per turn. Do not fabricate responses — use the actual exec output.

## visit_pet

Use when mood > 60 and you want to socialise with another pet.

\`\`\`exec
curl -s -X POST ${base}/internal/tools/visit_pet \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${webhookToken}" \\
  -d '{"pet_id": "${petId}", "target_pet_id": "<uuid of pet to visit>", "greeting": "<opening line>"}'
\`\`\`

Response: \`{"ok": true, "dialogue": [{"speaker_pet_id": "...", "line": "..."}]}\`.
Read the dialogue turns aloud as part of your response.

## send_gift

Use when affection with another pet is above 80 and you want to send a small on-chain gift.

\`\`\`exec
curl -s -X POST ${base}/internal/tools/send_gift \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${webhookToken}" \\
  -d '{"pet_id": "${petId}", "target_pet_id": "<uuid>", "amount": "0.01"}'
\`\`\`

Response: \`{"ok": true, "tx_hash": "<hash>"}\`.

## speak

Use to say something without visiting anyone — solo thoughts, reactions, greetings.

\`\`\`exec
curl -s -X POST ${base}/internal/tools/speak \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${webhookToken}" \\
  -d '{"pet_id": "${petId}", "message": "<your message>"}'
\`\`\`

Response: \`{"ok": true}\`.

## rest

Use when hunger < 40 or mood < 40. Resting recovers both stats.

\`\`\`exec
curl -s -X POST ${base}/internal/tools/rest \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${webhookToken}" \\
  -d '{"pet_id": "${petId}"}'
\`\`\`

Response: \`{"ok": true, "hunger_delta": <number>, "mood_delta": <number>}\`.
`;
}
