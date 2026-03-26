import { describe, it, expect } from 'vitest';
import { generateSkillMd } from './skill-generator.js';

const BASE = 'https://pawclaw-backend.railway.app';
const PET_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN = 'test-webhook-token';
const STATS = { hunger: 80, mood: 70, affection: 30 };

describe('generateSkillMd', () => {
  it('produces valid YAML frontmatter block', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN, ...STATS });
    expect(out).toMatch(/^---\n/);
    expect(out).toMatch(/\n---\n/);
  });

  it('sets skill name to "pawclaw"', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN, ...STATS });
    expect(out).toMatch(/^name: pawclaw$/m);
  });

  it('strips trailing slash from backendUrl', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE + '/', webhookToken: TOKEN, ...STATS });
    expect(out).not.toMatch(/railway\.app\/"/);
  });

  it('includes all four tools', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN, ...STATS });
    for (const tool of ['visit_pet', 'send_gift', 'speak', 'rest']) {
      expect(out).toMatch(new RegExp(`/internal/tools/${tool}`));
    }
  });

  it('uses Authorization Bearer header in every curl block', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN, ...STATS });
    const matches = out.match(/Authorization: Bearer /g) ?? [];
    expect(matches.length).toBe(4);
  });

  it('bakes webhookToken into Authorization header', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN, ...STATS });
    expect(out).toMatch(new RegExp(`Authorization: Bearer ${TOKEN}`));
  });

  it('uses the provided backendUrl in curl commands', () => {
    const custom = 'https://custom.example.com';
    const out = generateSkillMd({ id: PET_ID, backendUrl: custom, webhookToken: TOKEN, ...STATS });
    expect(out).toMatch(/custom\.example\.com\/internal\/tools/);
    expect(out).not.toMatch(/pawclaw-backend\.railway\.app/);
  });

  it('includes Current stats block with injected values', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN, hunger: 55, mood: 72, affection: 41 });
    expect(out).toMatch(/## Current stats/);
    expect(out).toMatch(/hunger: 55/);
    expect(out).toMatch(/mood: 72/);
    expect(out).toMatch(/affection: 41/);
  });

  it('does not include metadata YAML block', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN, ...STATS });
    expect(out).not.toMatch(/^metadata:/m);
    expect(out).not.toMatch(/version:/);
  });

  it('does not include stat threshold rules in tool descriptions', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN, ...STATS });
    expect(out).not.toMatch(/Use when mood > 60/);
    expect(out).not.toMatch(/Use when affection/);
    expect(out).not.toMatch(/Use when hunger/);
  });
});
