import { describe, it, expect } from 'vitest';
import { generateSoulMd } from './soul-generator.js';

describe('generateSoulMd', () => {
  it('produces valid YAML frontmatter block', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat who loves books' });
    expect(out).toMatch(/^---\n/);
    expect(out).toMatch(/\n---\n/);
  });

  it('includes name in frontmatter', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat' });
    expect(out).toMatch(/^name: Mochi$/m);
  });

  it('infers species from soul_prompt', () => {
    const out = generateSoulMd({ name: 'Rex', mood: 50, soul_prompt: 'a brave dog who patrols the neighbourhood' });
    expect(out).toMatch(/^species: dog$/m);
  });

  it('falls back to "unknown" when no species keyword is found', () => {
    const out = generateSoulMd({ name: 'Zap', mood: 50, soul_prompt: 'a mysterious being from another dimension' });
    expect(out).toMatch(/^species: unknown$/m);
  });

  it('sets mood_baseline from pet.mood', () => {
    const out = generateSoulMd({ name: 'Pip', mood: 42, soul_prompt: 'a sleepy penguin' });
    expect(out).toMatch(/^mood_baseline: 42$/m);
  });

  it('injects soul_prompt verbatim as personality', () => {
    const out = generateSoulMd({ name: 'Luna', mood: 60, soul_prompt: 'a shy dragon, afraid of loud noises' });
    expect(out).toMatch(/^personality: a shy dragon, afraid of loud noises$/m);
  });

  it('includes pet name in stay-in-character rule', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat' });
    expect(out).toMatch(/Stay in character as Mochi/);
  });

  it('does not include hunger/mood threshold behavior rules', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat' });
    expect(out).not.toMatch(/hunger/);
    expect(out).not.toMatch(/mood > 60/);
  });

  it('includes soul_prompt text in backstory', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat who loves books' });
    expect(out).toMatch(/a curious cat who loves books/);
  });

  it('includes on-chain identity section', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat' });
    expect(out).toMatch(/## On-chain identity/);
    expect(out).toMatch(/onchainos/);
  });
});
