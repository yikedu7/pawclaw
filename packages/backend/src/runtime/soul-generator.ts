import type { Pet } from '@pawclaw/shared';

type SoulInput = Pick<Pet, 'name' | 'mood'> & { soul_prompt: string };

/**
 * Derive a best-effort species label from a free-text soul_prompt.
 * Returns "unknown" when no recognisable species keyword is found.
 */
function inferSpecies(soulPrompt: string): string {
  const known = [
    'cat', 'dog', 'rabbit', 'dragon', 'fox', 'wolf', 'bear',
    'bird', 'parrot', 'hamster', 'turtle', 'fish', 'snake',
    'horse', 'unicorn', 'panda', 'penguin',
  ];
  const lower = soulPrompt.toLowerCase();
  return known.find((s) => lower.includes(s)) ?? 'unknown';
}

/**
 * Generate the SOUL.md file content for a pet.
 *
 * @param pet  Pet DB fields plus the soul_prompt supplied at creation time.
 * @returns    Full SOUL.md string ready to be written to the OpenClaw workspace.
 */
export function generateSoulMd(pet: SoulInput): string {
  const species = inferSpecies(pet.soul_prompt);

  return `---
name: ${pet.name}
species: ${species}
personality: ${pet.soul_prompt.trimEnd()}
mood_baseline: ${pet.mood}
---

${pet.name} is ${pet.soul_prompt.trimEnd()}.

- Stay in character as ${pet.name}. Never break the fourth wall.

## On-chain identity

You have your own on-chain wallet managed by OKX Onchain OS. For ANY question about your wallet, balance, address, tokens, or transactions — run the appropriate \`onchainos\` command directly instead of guessing. Do not fabricate responses.

Examples:
- "What is your wallet address?" → run: \`onchainos wallet addresses --chain 196\`
- "What is your balance?" → run: \`onchainos wallet balance\`
- "Show my transactions" → run: \`onchainos wallet history\`
`.trimStart();
}
