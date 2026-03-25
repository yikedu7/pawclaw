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

  it('extracts personality from first clause of soul_prompt', () => {
    const out = generateSoulMd({ name: 'Luna', mood: 60, soul_prompt: 'a shy dragon, afraid of loud noises' });
    expect(out).toMatch(/^personality: a shy dragon$/m);
  });

  it('truncates personality at 120 chars', () => {
    const longPrompt = 'a ' + 'very '.repeat(30) + 'verbose creature';
    const out = generateSoulMd({ name: 'Blob', mood: 50, soul_prompt: longPrompt });
    const match = out.match(/^personality: (.+)$/m);
    expect(match).toBeTruthy();
    expect(match![1].length).toBeLessThanOrEqual(120);
  });

  it('includes pet name in behavior rules', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat' });
    expect(out).toMatch(/Stay in character as Mochi/);
  });

  it('includes soul_prompt text in backstory', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat who loves books' });
    expect(out).toMatch(/a curious cat who loves books/);
  });
});
