/**
 * Unit tests for the grantDbCredits code path in POST /api/pets.
 *
 * grantDbCredits(petId) is always called at pet creation — no wallet_address
 * guard since it writes directly to the DB.
 */
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

// ── Module mocks (hoisted) ───────────────────────────────────────────────────

const mockGrantCredits = vi.fn<(petId: string) => Promise<void>>();

vi.mock('../../onchain/credits.js', () => ({
  grantDbCredits: mockGrantCredits,
}));

const PET_ID = '00000000-0000-4000-b000-000000000099';

// Mock DB — returns a pet with no wallet_address (normal at creation time)
vi.mock('../../db/client.js', () => ({
  db: {
    insert: () => ({
      values: (vals: Record<string, unknown>) => ({
        returning: async () => [{
          id: PET_ID,
          owner_id: vals.owner_id ?? '',
          name: vals.name ?? '',
          soul_md: vals.soul_md ?? '',
          skill_md: '',
          wallet_address: null,
          initial_credits: 200,
          hunger: 100, mood: 100, affection: 0,
          llm_history: [], last_tick_at: null, created_at: new Date(),
          diary_text: null, container_id: null, container_host: null,
          container_port: null, container_status: 'created',
          gateway_token: null, port_index: null,
        }],
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [{
            id: PET_ID,
            owner_id: 'owner-1',
            name: 'TestPet',
            soul_md: '# SOUL',
            skill_md: (vals.skill_md as string) ?? '',
            wallet_address: null,
            initial_credits: 200,
            hunger: 100, mood: 100, affection: 0,
            llm_history: [], last_tick_at: null, created_at: new Date(),
            diary_text: null, container_id: null, container_host: null,
            container_port: null, container_status: 'created',
            gateway_token: null, port_index: null,
          }],
        }),
      }),
    }),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: () => () => true,
}));

// ── Test setup ───────────────────────────────────────────────────────────────

const SECRET = 'credits-unit-test-secret';
const OWNER_ID = '00000000-0000-4000-a000-000000000001';

function makeToken(sub: string): string {
  return jwt.sign({ sub }, SECRET);
}

async function buildApp(): Promise<FastifyInstance> {
  process.env.JWT_SECRET = SECRET;
  const Fastify = (await import('fastify')).default;
  const { registerPetRoutes } = await import('../petRoutes.js');
  const app = Fastify();
  await registerPetRoutes(app, {
    generateSoulMd: () => '# SOUL',
    generateSkillMd: () => '# SKILL',
  });
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/pets — grantDbCredits (unit)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(() => {
    mockGrantCredits.mockReset();
    mockGrantCredits.mockResolvedValue(undefined);
  });

  it('calls grantDbCredits with the pet id', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
      payload: { name: 'CreditsPet', soul_prompt: 'a generous dog' },
    });
    expect(res.statusCode).toBe(201);
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGrantCredits).toHaveBeenCalledWith(PET_ID);
  });

  it('still returns 201 when grantDbCredits rejects', async () => {
    mockGrantCredits.mockRejectedValueOnce(new Error('db unavailable'));
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
      payload: { name: 'CreditsPet2', soul_prompt: 'a resilient cat' },
    });
    expect(res.statusCode).toBe(201);
    await new Promise((r) => setTimeout(r, 0));
  });
});
