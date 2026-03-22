import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSoulMd } from './soul-generator.js';

describe('generateSoulMd', () => {
  it('produces valid YAML frontmatter block', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat who loves books' });
    assert.match(out, /^---\n/);
    assert.match(out, /\n---\n/);
  });

  it('includes name in frontmatter', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat' });
    assert.match(out, /^name: Mochi$/m);
  });

  it('infers species from soul_prompt', () => {
    const out = generateSoulMd({ name: 'Rex', mood: 50, soul_prompt: 'a brave dog who patrols the neighbourhood' });
    assert.match(out, /^species: dog$/m);
  });

  it('falls back to "unknown" when no species keyword is found', () => {
    const out = generateSoulMd({ name: 'Zap', mood: 50, soul_prompt: 'a mysterious being from another dimension' });
    assert.match(out, /^species: unknown$/m);
  });

  it('sets mood_baseline from pet.mood', () => {
    const out = generateSoulMd({ name: 'Pip', mood: 42, soul_prompt: 'a sleepy penguin' });
    assert.match(out, /^mood_baseline: 42$/m);
  });

  it('extracts personality from first clause of soul_prompt', () => {
    const out = generateSoulMd({ name: 'Luna', mood: 60, soul_prompt: 'a shy dragon, afraid of loud noises' });
    assert.match(out, /^personality: a shy dragon$/m);
  });

  it('truncates personality at 120 chars', () => {
    const longPrompt = 'a ' + 'very '.repeat(30) + 'verbose creature';
    const out = generateSoulMd({ name: 'Blob', mood: 50, soul_prompt: longPrompt });
    const match = out.match(/^personality: (.+)$/m);
    assert.ok(match, 'personality line present');
    assert.ok(match[1].length <= 120, `personality too long: ${match[1].length}`);
  });

  it('includes pet name in behavior rules', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat' });
    assert.match(out, /Stay in character as Mochi/);
  });

  it('includes soul_prompt text in backstory', () => {
    const out = generateSoulMd({ name: 'Mochi', mood: 70, soul_prompt: 'a curious cat who loves books' });
    assert.match(out, /a curious cat who loves books/);
  });
});
