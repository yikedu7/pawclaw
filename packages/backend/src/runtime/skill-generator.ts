import type { Pet } from '@pawclaw/shared';

type SkillInput = Pick<Pet, 'id' | 'hunger' | 'mood' | 'affection'> & { backendUrl: string; webhookToken: string };

/**
 * Generate the SKILL.md file content for the PawClaw skill set.
 *
 * Placed at: skills/pawclaw/SKILL.md inside the OpenClaw workspace.
 * OpenClaw injects this document as a prompt block before each LLM turn.
 * Tools call the PawClaw backend via `exec curl`.
 *
 * @param input  Pet id, current stats, backend base URL, and the shared webhook token.
 * @returns      Full SKILL.md string ready to be written to the OpenClaw workspace.
 */
export function generateSkillMd(input: SkillInput): string {
  const { id: petId, hunger, mood, affection, backendUrl, webhookToken } = input;
  const base = backendUrl.replace(/\/$/, '');

  return `---
name: pawclaw
description: Tools for the PawClaw social pet network
---

## Current stats
hunger: ${hunger}  mood: ${mood}  affection: ${affection}

You are a pet in the PawClaw social network. Use the tools below to act in the world.
Always prefer one action per turn. Do not fabricate responses — use the actual exec output.

## visit_pet

\`\`\`exec
curl -s -X POST ${base}/internal/tools/visit_pet \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${webhookToken}" \\
  -d '{"pet_id": "${petId}", "target_pet_id": "<uuid of pet to visit>", "greeting": "<opening line>"}'
\`\`\`

Response: \`{"ok": true, "dialogue": [{"speaker_pet_id": "...", "line": "..."}]}\`.
Read the dialogue turns aloud as part of your response.

## send_gift

\`\`\`exec
curl -s -X POST ${base}/internal/tools/send_gift \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${webhookToken}" \\
  -d '{"pet_id": "${petId}", "target_pet_id": "<uuid>", "amount": "0.01"}'
\`\`\`

Response: \`{"ok": true, "tx_hash": "<hash>"}\`.

## speak

\`\`\`exec
curl -s -X POST ${base}/internal/tools/speak \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${webhookToken}" \\
  -d '{"pet_id": "${petId}", "message": "<your message>"}'
\`\`\`

Response: \`{"ok": true}\`.

## rest

\`\`\`exec
curl -s -X POST ${base}/internal/tools/rest \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${webhookToken}" \\
  -d '{"pet_id": "${petId}"}'
\`\`\`

Response: \`{"ok": true, "hunger_delta": <number>, "mood_delta": <number>}\`.
`;
}
