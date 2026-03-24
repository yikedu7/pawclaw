import { vi, describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

// ── Module mocks (hoisted) ───────────────────────────────────────────────────

const mockGrantCredits = vi.fn<(wallet: string) => Promise<void>>();

vi.mock('../../onchain/credits.js', () => ({
  grantRegistrationCredits: mockGrantCredits,
}));

// DB mock — update() returns a pet row WITH wallet_address set so credits fire
const PET_ID = '00000000-0000-4000-b000-000000000099';
const WALLET = '0xpet-wallet-address';

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
            wallet_address: WALLET,
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

const SECRET = 'credits-test-secret';
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

describe('POST /api/pets — registration credits', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('calls grantRegistrationCredits with the pet wallet address', async () => {
    mockGrantCredits.mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
      payload: { name: 'CreditsPet', soul_prompt: 'a generous dog' },
    });

    expect(res.statusCode).toBe(201);
    // Allow microtask queue to flush the non-blocking call
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGrantCredits).toHaveBeenCalledWith(WALLET);
  });

  it('still returns 201 when grantRegistrationCredits rejects', async () => {
    mockGrantCredits.mockRejectedValue(new Error('chain unavailable'));

    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
      payload: { name: 'CreditsPet2', soul_prompt: 'a resilient cat' },
    });

    expect(res.statusCode).toBe(201);
    // Flush so the unhandled rejection is caught by .catch() and doesn't fail the test
    await new Promise((r) => setTimeout(r, 0));
  });
});
