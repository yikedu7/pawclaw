/**
 * Integration test for deliverTick() against a real OrbStack VM container.
 *
 * Verifies that:
 *  1. A container starts and becomes healthy
 *  2. deliverTick() completes without error (exec exits 0 — OpenClaw accepted the webhook)
 *  3. Container is cleaned up afterwards
 *
 * Prerequisites:
 *   - OrbStack VM 'hetzner-test' accessible (HETZNER_HOST=192.168.139.172)
 *   - ANTHROPIC_API_KEY set (real key — container needs it to start)
 *   - DATABASE_URL pointing to running Supabase local
 *
 * Run:
 *   cd packages/backend
 *   HETZNER_HOST=192.168.139.172 HETZNER_USER=deploy \
 *   HETZNER_SSH_KEY="$(cat ~/.orbstack/ssh/id_ed25519)" \
 *   HETZNER_HOST_DATA_DIR=/data/pets \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
 *   node_modules/.bin/tsx --env-file=.env scripts/e2e-deliver-tick.ts
 */

import pg from 'pg';
import {
  createPetContainer,
  startContainer,
  deliverTick,
  stopContainer,
  removeContainer,
} from '../src/runtime/container.js';

const { Pool } = pg;

const PET_ID = '00000000-e2e1-4000-a000-000000000002';
const OWNER_ID = '00000000-e2e1-4000-b000-000000000002';

const SOUL_MD = `---
name: E2ETickPet
---

You are a cheerful test cat. When you receive a tick, always call the \`speak\` tool
with a short greeting. Do not call any other tools.
`;

async function seedAuthUser(pool: InstanceType<typeof Pool>) {
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'e2e-tick@test.local', '$2a$10$fake', 'authenticated', 'authenticated',
            '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_ID]);
}

async function seedPet(pool: InstanceType<typeof Pool>) {
  await pool.query(`
    INSERT INTO pets (id, owner_id, name, soul_md, skill_md)
    VALUES ($1, $2, 'E2ETickPet', $3, '# no tools')
    ON CONFLICT (id) DO UPDATE SET soul_md = $3
  `, [PET_ID, OWNER_ID, SOUL_MD]);
}

async function cleanup(pool: InstanceType<typeof Pool>, containerId: string | null) {
  if (containerId) {
    try { await removeContainer(containerId); } catch {}
  }
  await pool.query('DELETE FROM port_allocations WHERE pet_id = $1', [PET_ID]);
  await pool.query('DELETE FROM pets WHERE id = $1', [PET_ID]);
  await pool.query('DELETE FROM auth.users WHERE id = $1', [OWNER_ID]);
}

function step(msg: string) { process.stdout.write(`\n▶ ${msg}\n`); }
function ok(msg: string) { process.stdout.write(`  ✓ ${msg}\n`); }

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  if (!process.env.HETZNER_HOST) throw new Error('HETZNER_HOST required');
  if (!process.env.HETZNER_SSH_KEY) throw new Error('HETZNER_SSH_KEY required');
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sk-ant-placeholder') {
    throw new Error('Real ANTHROPIC_API_KEY required — container needs it to start');
  }

  const pool = new Pool({ connectionString: url });
  let containerId: string | null = null;

  try {
    step('Seeding DB');
    await seedAuthUser(pool);
    await seedPet(pool);
    ok('auth.users + pets rows created');

    step('createPetContainer');
    const result = await createPetContainer(PET_ID, SOUL_MD, '# no tools');
    containerId = result.containerId;
    ok(`containerId: ${containerId.slice(0, 12)}...`);

    step('startContainer (waiting for healthy — up to 60s)');
    await startContainer(containerId);
    ok('container is healthy');

    step('deliverTick');
    const payload = {
      pet_id: PET_ID,
      tick_at: new Date().toISOString(),
      state: { hunger: 80, mood: 75, affection: 10 },
      context: { nearby_pets: [], recent_events: [] },
    };
    await deliverTick(containerId, PET_ID, payload);
    ok('deliverTick completed — exec exited 0 (OpenClaw accepted the webhook)');

    step('stopContainer');
    await stopContainer(containerId);
    ok('stopped');

    step('removeContainer');
    await removeContainer(containerId);
    containerId = null;
    ok('removed');

    process.stdout.write('\n✅ deliverTick integration test passed\n\n');
  } catch (err) {
    process.stdout.write(`\n❌ FAILED: ${(err as Error).message}\n`);
    process.exit(1);
  } finally {
    await cleanup(pool, containerId);
    await pool.end();
  }
}

main();
