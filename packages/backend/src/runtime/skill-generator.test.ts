import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSkillMd } from './skill-generator.js';

const BASE = 'https://x-pet-backend.railway.app';
const PET_ID = '00000000-0000-0000-0000-000000000001';
const TOKEN = 'test-webhook-token';

describe('generateSkillMd', () => {
  it('produces valid YAML frontmatter block', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    assert.match(out, /^---\n/);
    assert.match(out, /\n---\n/);
  });

  it('sets skill name to "x-pet"', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    assert.match(out, /^name: x-pet$/m);
  });

  it('embeds pet_id in frontmatter', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    assert.match(out, new RegExp(`pet_id: "${PET_ID}"`));
  });

  it('embeds backend_url in frontmatter', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    assert.match(out, new RegExp(`backend_url: "${BASE}"`));
  });

  it('strips trailing slash from backendUrl', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE + '/', webhookToken: TOKEN });
    assert.doesNotMatch(out, /railway\.app\/"/);
  });

  it('includes all four tools', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    for (const tool of ['visit_pet', 'send_gift', 'speak', 'rest']) {
      assert.match(out, new RegExp(`/internal/tools/${tool}`), `missing tool: ${tool}`);
    }
  });

  it('uses Authorization Bearer header in every curl block', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    const matches = out.match(/Authorization: Bearer /g) ?? [];
    // one header per tool (4 tools)
    assert.equal(matches.length, 4);
  });

  it('bakes webhookToken into Authorization header', () => {
    const out = generateSkillMd({ id: PET_ID, backendUrl: BASE, webhookToken: TOKEN });
    assert.match(out, new RegExp(`Authorization: Bearer ${TOKEN}`));
  });

  it('uses the provided backendUrl in curl commands', () => {
    const custom = 'https://custom.example.com';
    const out = generateSkillMd({ id: PET_ID, backendUrl: custom, webhookToken: TOKEN });
    assert.match(out, /custom\.example\.com\/internal\/tools/);
    assert.doesNotMatch(out, /railway\.app/);
  });
});
