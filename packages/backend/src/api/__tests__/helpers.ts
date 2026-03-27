import { vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import Fastify, { type FastifyInstance } from 'fastify';

vi.mock('../../onchain/credits.js', () => ({
  grantDbCredits: vi.fn().mockResolvedValue(undefined),
}));

export const OWNER_ID = '00000000-0000-4000-a000-000000000001';
export const OTHER_OWNER = '00000000-0000-4000-a000-000000000002';

// Mock authHook — unit tests using helpers.ts test business logic, not auth.
// Tokens of the form "fake:<uuid>" pass; anything else returns 401.
vi.mock('../authHook.js', () => ({
  authHook: () => async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? '';
    if (!header.startsWith('Bearer fake:')) {
      return reply.code(401).send({ error: 'Missing or invalid token', code: 'UNAUTHORIZED' });
    }
    request.owner_id = header.slice('Bearer fake:'.length);
  },
}));

export function makeToken(sub: string): string {
  return `fake:${sub}`;
}

// ── In-memory pet store ─────────────────────────────────────────────────────

export type PetRow = {
  id: string;
  owner_id: string;
  name: string;
  soul_md: string;
  skill_md: string;
  wallet_address: string | null;
  hunger: number;
  mood: number;
  affection: number;
  initial_credits: string;
  system_credits: string;
  onchain_balance: string;
  llm_history: unknown;
  last_tick_at: Date | null;
  created_at: Date;
  diary_text: string | null;
  container_id: string | null;
  container_host: string | null;
  container_port: number | null;
  container_status: string;
  gateway_token: string | null;
  port_index: number | null;
  tint_color: string;
};

export let petRows: PetRow[] = [];
export let idCounter = 0;

export function resetStore(): void {
  petRows = [];
  idCounter = 0;
}

export function makePetId(): string {
  idCounter++;
  return `00000000-0000-4000-b000-${String(idCounter).padStart(12, '0')}`;
}

export function seedPet(overrides: Partial<PetRow> & { id: string; owner_id: string }): PetRow {
  const row: PetRow = {
    name: 'TestPet',
    soul_md: '#',
    skill_md: '#',
    wallet_address: null,
    initial_credits: '0.3',
    system_credits: '0.24',
    onchain_balance: '0',
    hunger: 20,
    mood: 80,
    affection: 20,
    llm_history: [],
    last_tick_at: null,
    created_at: new Date(),
    diary_text: null,
    container_id: null,
    container_host: null,
    container_port: null,
    container_status: 'created',
    gateway_token: null,
    port_index: null,
    tint_color: '#ffffff',
    ...overrides,
  };
  petRows.push(row);
  return row;
}

// ── DB + drizzle-orm mocks ──────────────────────────────────────────────────

vi.mock('../../db/client.js', () => {
  const selectBuilder = () => {
    let whereFilter: ((row: PetRow) => boolean) | undefined;
    const builder = {
      from: () => builder,
      where: (fn: unknown) => { whereFilter = fn as (row: PetRow) => boolean; return builder; },
      then: (resolve: (val: PetRow[]) => void) => {
        // Dynamic import to get current petRows reference
        import('./helpers.js').then((m) => {
          resolve(whereFilter ? m.petRows.filter(whereFilter) : m.petRows);
        });
      },
    };
    return builder;
  };

  return {
    db: {
      select: () => selectBuilder(),
      insert: () => ({
        values: (vals: Partial<PetRow>) => ({
          returning: async () => {
            const m = await import('./helpers.js');
            const row: PetRow = {
              id: m.makePetId(),
              owner_id: vals.owner_id ?? '',
              name: vals.name ?? '',
              soul_md: vals.soul_md ?? '',
              skill_md: vals.skill_md ?? '',
              wallet_address: vals.wallet_address ?? null,
              initial_credits: vals.initial_credits ?? '0.3',
              system_credits: vals.system_credits ?? '0.24',
              onchain_balance: vals.onchain_balance ?? '0',
              hunger: vals.hunger ?? 20,
              mood: vals.mood ?? 80,
              affection: vals.affection ?? 20,
              tint_color: vals.tint_color ?? '#ffffff',
              llm_history: [],
              last_tick_at: null,
              created_at: new Date(),
              diary_text: null,
              container_id: null,
              container_host: null,
              container_port: null,
              container_status: 'created',
              gateway_token: null,
              port_index: null,
            };
            m.petRows.push(row);
            return [row];
          },
        }),
      }),
      update: () => ({
        set: (vals: Partial<PetRow>) => ({
          where: () => ({
            returning: async () => {
              const m = await import('./helpers.js');
              const row = m.petRows[m.petRows.length - 1];
              Object.assign(row, vals);
              return [row];
            },
          }),
        }),
      }),
    },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (col: { name: string }, val: string) => {
    return (row: Record<string, unknown>) => row[col.name] === val;
  },
}));


// ── App factory ─────────────────────────────────────────────────────────────

export async function buildApp(): Promise<FastifyInstance> {
  const { registerPetRoutes } = await import('../petRoutes.js');
  const app = Fastify();
  await registerPetRoutes(app, {
    generateSoulMd: () => '# SOUL',
    generateSkillMd: () => '# SKILL',
  });
  return app;
}
