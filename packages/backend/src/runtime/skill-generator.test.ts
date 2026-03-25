import { describe, it, expect } from 'vitest';
import { generateSkillMd } from './skill-generator.js';

const BASE = 'https://pawclaw-backend.railway.app';
const PET_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN = 'test-webhook-token';

describe('generateSkillMd', () => {
  it('produces valid YAML frontmatter block', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    expect(out).toMatch(/^---\n/);
    expect(out).toMatch(/\n---\n/);
  });

  it('sets skill name to "pawclaw"', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    expect(out).toMatch(/^name: pawclaw$/m);
  });

  it('embeds pet_id in frontmatter', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    expect(out).toMatch(new RegExp(`pet_id: "${PET_ID}"`));
  });

  it('embeds backend_url in frontmatter', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    expect(out).toMatch(new RegExp(`backend_url: "${BASE}"`));
  });

  it('strips trailing slash from backendUrl', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE + '/', webhookToken: TOKEN });
    expect(out).not.toMatch(/railway\.app\/"/);
  });

  it('includes all four tools', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    for (const tool of ['visit_pet', 'send_gift', 'speak', 'rest']) {
      expect(out).toMatch(new RegExp(`/internal/tools/${tool}`));
    }
  });

  it('uses Authorization Bearer header in every curl block', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    const matches = out.match(/Authorization: Bearer /g) ?? [];
    expect(matches.length).toBe(4);
  });

  it('bakes webhookToken into Authorization header', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    expect(out).toMatch(new RegExp(`Authorization: Bearer ${TOKEN}`));
  });

  it('uses the provided backendUrl in curl commands', () => {
    const custom = 'https://custom.example.com';
    const out = generateSkillMd({ id: PET_ID, backendUrl: custom, webhookToken: TOKEN });
    expect(out).toMatch(/custom\.example\.com\/internal\/tools/);
    expect(out).not.toMatch(/pawclaw-backend\.railway\.app/);
  });
});
