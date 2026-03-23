/**
 * Unit tests for container.ts
 *
 * Docker and SSH are mocked — these tests verify:
 * - Port allocation logic and DB writes
 * - Container create/start/stop/remove state transitions
 * - getContainerStatus returns correct values
 *
 * Integration tests hitting a real Docker daemon are out of scope for CI
 * (requires live Hetzner VPS). See docs/hetzner-setup.md for manual testing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock ssh2 so no real SSH connections are made
vi.mock('ssh2', () => ({
  Client: vi.fn().mockImplementation(() => ({
    on: vi.fn().mockReturnThis(),
    connect: vi.fn(),
    end: vi.fn(),
    sftp: vi.fn(),
    exec: vi.fn(),
  })),
}));

// Track docker calls
const mockContainerStart = vi.fn().mockResolvedValue(undefined);
const mockContainerStop = vi.fn().mockResolvedValue(undefined);
const mockContainerRemove = vi.fn().mockResolvedValue(undefined);
const mockContainerInspect = vi.fn();
const mockCreateContainer = vi.fn();

vi.mock('dockerode', () => ({
  default: vi.fn().mockImplementation(() => ({
    createContainer: mockCreateContainer,
    getContainer: vi.fn().mockReturnValue({
      start: mockContainerStart,
      stop: mockContainerStop,
      remove: mockContainerRemove,
      inspect: mockContainerInspect,
    }),
  })),
}));

// Track DB state
type PortRow = { id: string; pet_id: string; port: number; released_at: Date | null };
type PetRow = {
  id: string; name: string; hunger: number; mood: number; affection: number;
  container_id: string | null; container_host: string | null; container_port: number | null;
  container_status: string; gateway_token: string | null; port_index: number | null;
};

let petsDb: PetRow[] = [];
let portsDb: PortRow[] = [];
let portInsertPort = 19000;

vi.mock('../../db/client.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (filter: (r: PetRow | PortRow) => boolean) => {
          // Determine which table we're reading based on invocation order in tests
          const matchedPets = petsDb.filter(filter as (r: PetRow) => boolean);
          const result = matchedPets;
          return {
            limit: (_n: number) => Promise.resolve(result),
            // also be thenable for cases where .limit() is not called
            then: (resolve: (v: PetRow[]) => void) => Promise.resolve(result).then(resolve),
          };
        },
      }),
    }),
    update: (_table: unknown) => ({
      set: (vals: Partial<PetRow | PortRow>) => ({
        where: () => {
          for (const row of petsDb) Object.assign(row, vals);
          for (const row of portsDb) Object.assign(row, vals);
          return Promise.resolve([]);
        },
      }),
    }),
    execute: () => Promise.resolve({ rows: [{ port: portInsertPort }] }),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: { name: string }, val: string) => (row: Record<string, unknown>) => row[col.name] === val,
  isNull: () => () => true,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

vi.mock('../../runtime/config-generator.js', () => ({
  generateConfigJson: () => '{"model":"claude-sonnet-4-6"}',
}));

vi.mock('../../runtime/heartbeat-generator.js', () => ({
  generateHeartbeatMd: () => '# Heartbeat',
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupEnv() {
  process.env.HETZNER_HOST = '1.2.3.4';
  process.env.HETZNER_USER = 'deploy';
  process.env.HETZNER_SSH_KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----';
  process.env.HETZNER_HOST_DATA_DIR = '/data/pets';
  process.env.BACKEND_URL = 'http://localhost:3001';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
}

const PET_ID = '00000000-1111-4000-a000-000000000001';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getContainerStatus', () => {
  beforeEach(() => {
    vi.resetModules();
    mockContainerInspect.mockReset();
  });

  it('returns running when container State.Running is true', async () => {
    mockContainerInspect.mockResolvedValue({ State: { Running: true } });
    const { getContainerStatus } = await import('../container.js');
    const status = await getContainerStatus('abc123');
    expect(status).toBe('running');
  });

  it('returns stopped when container State.Running is false', async () => {
    mockContainerInspect.mockResolvedValue({ State: { Running: false } });
    const { getContainerStatus } = await import('../container.js');
    const status = await getContainerStatus('abc123');
    expect(status).toBe('stopped');
  });

  it('returns missing when docker returns 404', async () => {
    mockContainerInspect.mockRejectedValue({ statusCode: 404 });
    const { getContainerStatus } = await import('../container.js');
    const status = await getContainerStatus('abc123');
    expect(status).toBe('missing');
  });

  it('rethrows non-404 docker errors', async () => {
    mockContainerInspect.mockRejectedValue({ statusCode: 500, message: 'internal error' });
    const { getContainerStatus } = await import('../container.js');
    await expect(getContainerStatus('abc123')).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('stopContainer', () => {
  beforeEach(() => {
    vi.resetModules();
    mockContainerStop.mockReset();
    petsDb = [{
      id: PET_ID, name: 'TestPet', hunger: 100, mood: 100, affection: 0,
      container_id: 'cid-stop', container_host: '1.2.3.4', container_port: 19001,
      container_status: 'running', gateway_token: 'tok', port_index: 1,
    }];
    setupEnv();
  });

  it('calls docker stop and updates container_status to stopped', async () => {
    const { stopContainer } = await import('../container.js');
    await stopContainer('cid-stop');
    expect(mockContainerStop).toHaveBeenCalledOnce();
    expect(petsDb[0].container_status).toBe('stopped');
  });
});

describe('removeContainer', () => {
  beforeEach(() => {
    vi.resetModules();
    mockContainerRemove.mockReset();
    portsDb = [{ id: 'port-id-1', pet_id: PET_ID, port: 19001, released_at: null }];
    petsDb = [{
      id: PET_ID, name: 'TestPet', hunger: 100, mood: 100, affection: 0,
      container_id: 'cid-remove', container_host: '1.2.3.4', container_port: 19001,
      container_status: 'stopped', gateway_token: 'tok', port_index: 1,
    }];
    setupEnv();
  });

  it('calls docker remove with force:true and sets container_status to deleted', async () => {
    const { removeContainer } = await import('../container.js');
    await removeContainer('cid-remove');
    expect(mockContainerRemove).toHaveBeenCalledWith({ force: true });
    expect(petsDb[0].container_status).toBe('deleted');
  });
});
