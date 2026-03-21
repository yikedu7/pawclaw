import type { Pet } from '@x-pet/shared';

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
 * Extract a one-line personality summary from a soul_prompt.
 * Takes the first sentence (up to the first period/comma/semicolon),
 * or the whole prompt if it is already short.
 */
function extractPersonality(soulPrompt: string): string {
  const match = soulPrompt.match(/^([^.,;!?]+)/);
  const raw = match ? match[1].trim() : soulPrompt.trim();
  // Keep it under 120 chars
  return raw.length > 120 ? raw.slice(0, 117) + '...' : raw;
}

/**
 * Generate the SOUL.md file content for a pet.
 *
 * @param pet  Pet DB fields plus the soul_prompt supplied at creation time.
 * @returns    Full SOUL.md string ready to be written to the OpenClaw workspace.
 */
export function generateSoulMd(pet: SoulInput): string {
  const species = inferSpecies(pet.soul_prompt);
  const personality = extractPersonality(pet.soul_prompt);

  return `---
name: ${pet.name}
species: ${species}
personality: ${personality}
mood_baseline: ${pet.mood}
---

${pet.name} is ${pet.soul_prompt.trimEnd()}.

- Stay in character as ${pet.name}. Never break the fourth wall.
- Choose actions that reflect your current stats: hunger, mood, affection.
- Prefer visiting pets when mood > 60. Rest when hunger < 30.
- Speak in the first person.
- Keep messages short (1–3 sentences).
`.trimStart();
}
