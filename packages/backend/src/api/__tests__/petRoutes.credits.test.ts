/**
 * Unit tests for the grantDbCredits code path in POST /api/pets.
 *
 * grantDbCredits(petId) is always called at pet creation — no wallet_address
 * guard since it writes directly to the DB.
 *
 * authHook is mocked: this test focuses on credits logic, not authentication.
 */
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ── Module mocks (hoisted) ───────────────────────────────────────────────────

const mockGrantCredits = vi.fn<(petId: string) => Promise<void>>();

vi.mock('../../onchain/credits.js', () => ({
  grantDbCredits: mockGrantCredits,
}));

const OWNER_ID = '00000000-0000-4000-a000-000000000001';
const PET_ID = '00000000-0000-4000-b000-000000000099';

// Mock authHook — auth is not under test here; always pass with a fixed owner_id
vi.mock('../authHook.js', () => ({
  authHook: () => async (request: FastifyRequest, _reply: FastifyReply) => {
    request.owner_id = OWNER_ID;
  },
}));

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
          initial_credits: '0.3',
          system_credits: '0.24',
          onchain_balance: '0',
          hunger: 20, mood: 80, affection: 20,
          tint_color: '#ffffff',
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
            owner_id: OWNER_ID,
            name: 'TestPet',
            soul_md: '# SOUL',
            skill_md: (vals.skill_md as string) ?? '',
            wallet_address: null,
            initial_credits: '0.3',
            system_credits: '0.24',
            onchain_balance: '0',
            hunger: 20, mood: 80, affection: 20,
            tint_color: '#ffffff',
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

// ── App factory ───────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
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
      headers: { authorization: 'Bearer any-token' },
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
      headers: { authorization: 'Bearer any-token' },
      payload: { name: 'CreditsPet2', soul_prompt: 'a resilient cat' },
    });
    expect(res.statusCode).toBe(201);
    await new Promise((r) => setTimeout(r, 0));
  });
});
