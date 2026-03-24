/**
 * Integration test: deliverTick + OpenClaw → backend callback.
 *
 * Flow:
 *   createPetContainer → startContainer (healthy) → deliverTick
 *   → OpenClaw runs LLM → curl /internal/tools/* → backend receives it
 *
 * The test watches BACKEND_LOG for a POST /internal/tools/ entry
 * (up to 60s) to confirm the full round-trip.
 *
 * Prerequisites:
 *   - Backend running on PORT (default 3002), log piped to /tmp/backend.log
 *   - BACKEND_URL=http://host.docker.internal:<PORT> in .env (baked into SKILL.md)
 *   - ANTHROPIC_API_KEY set to a real key
 *   - OrbStack VM accessible (HETZNER_HOST / HETZNER_USER / HETZNER_SSH_KEY)
 *
 * Run:
 *   cd packages/backend
 *   PORT=3002 node_modules/.bin/tsx --env-file=.env src/index.ts > /tmp/backend.log 2>&1 &
 *   HETZNER_HOST=192.168.139.172 HETZNER_USER=deploy \
 *   HETZNER_SSH_KEY="$(cat ~/.orbstack/ssh/id_ed25519)" \
 *   HETZNER_HOST_DATA_DIR=/data/pets \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
 *   node_modules/.bin/tsx --env-file=.env scripts/e2e-deliver-tick.ts
 */

import pg from 'pg';
import { readFile } from 'node:fs/promises';
import {
  createPetContainer,
  startContainer,
  deliverTick,
  stopContainer,
  removeContainer,
} from '../src/runtime/container.js';
import { generateSkillMd } from '../src/runtime/skill-generator.js';

const { Pool } = pg;

const PET_ID   = '00000000-e2e1-4000-a000-000000000002';
const OWNER_ID = '00000000-e2e1-4000-b000-000000000002';
const BACKEND_LOG = process.env.BACKEND_LOG ?? '/tmp/backend.log';

const SOUL_MD = `---
name: E2ECallbackPet
---

You are a test pet. When you receive a tick, you MUST immediately call the \`speak\` tool
with the message "callback-ok". Do not call any other tool. Do not add any other text.
`;

async function seedAuthUser(pool: InstanceType<typeof Pool>) {
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'e2e-callback@test.local', '$2a$10$fake', 'authenticated', 'authenticated',
            '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_ID]);
}

async function seedPet(pool: InstanceType<typeof Pool>, skillMd: string) {
  await pool.query(`
    INSERT INTO pets (id, owner_id, name, soul_md, skill_md)
    VALUES ($1, $2, 'E2ECallbackPet', $3, $4)
    ON CONFLICT (id) DO UPDATE SET soul_md = $3, skill_md = $4
  `, [PET_ID, OWNER_ID, SOUL_MD, skillMd]);
}

async function cleanup(pool: InstanceType<typeof Pool>, containerId: string | null) {
  if (containerId) {
    try { await stopContainer(containerId); } catch {}
    try { await removeContainer(containerId); } catch {}
  }
  await pool.query('DELETE FROM port_allocations WHERE pet_id = $1', [PET_ID]);
  await pool.query('DELETE FROM pets WHERE id = $1', [PET_ID]);
  await pool.query('DELETE FROM auth.users WHERE id = $1', [OWNER_ID]);
}

function step(msg: string) { process.stdout.write(`\n▶ ${msg}\n`); }
function ok(msg: string)   { process.stdout.write(`  ✓ ${msg}\n`); }
function info(msg: string) { process.stdout.write(`  · ${msg}\n`); }

/**
 * Poll BACKEND_LOG for a /internal/tools/ request appearing after tickedAt.
 */
async function waitForCallback(tickedAt: number, timeoutMs = 60_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const log = await readFile(BACKEND_LOG, 'utf-8');
      for (const line of log.split('\n')) {
        if (!line.includes('/internal/tools/')) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.time >= tickedAt) return line;
        } catch {
          return line; // non-JSON fallback
        }
      }
    } catch { /* log not yet written */ }
    info(`waiting… ${Math.round((deadline - Date.now()) / 1000)}s left`);
  }
  return null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  if (!process.env.HETZNER_HOST) throw new Error('HETZNER_HOST required');
  if (!process.env.HETZNER_SSH_KEY && !process.env.HETZNER_SSH_KEY_FILE) {
    throw new Error('HETZNER_SSH_KEY or HETZNER_SSH_KEY_FILE required');
  }
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('placeholder')) {
    throw new Error('Real ANTHROPIC_API_KEY required');
  }

  const backendUrl = process.env.BACKEND_URL ?? 'http://host.docker.internal:3002';
  const webhookToken = process.env.OPENCLAW_WEBHOOK_TOKEN;
  if (!webhookToken) throw new Error('OPENCLAW_WEBHOOK_TOKEN required');

  const skillMd = generateSkillMd({ id: PET_ID, backendUrl, webhookToken });
  info(`BACKEND_URL in SKILL.md: ${backendUrl}`);
  info(`Watching for callbacks in: ${BACKEND_LOG}`);

  const pool = new Pool({ connectionString: url });
  let containerId: string | null = null;
  let gatewayToken: string | null = null;

  try {
    step('Seeding DB');
    await seedAuthUser(pool);
    await seedPet(pool, skillMd);
    ok('auth.users + pets rows created');

    step('createPetContainer');
    const result = await createPetContainer(PET_ID, SOUL_MD, skillMd);
    containerId = result.containerId;
    gatewayToken = result.gatewayToken;
    ok(`containerId: ${containerId.slice(0, 12)}...`);

    step('startContainer (waiting for healthy — up to 60s)');
    await startContainer(containerId);
    ok('container is healthy');

    step('deliverTick');
    const tickedAt = Date.now();
    await deliverTick(containerId, gatewayToken, {
      pet_id: PET_ID,
      tick_at: new Date().toISOString(),
      state: { hunger: 80, mood: 75, affection: 10 },
      context: { nearby_pets: [], recent_events: [] },
    });
    ok('exec exited 0 — system event enqueued, heartbeat woken');

    step('Waiting for OpenClaw → backend callback (up to 60s)');
    const callbackLine = await waitForCallback(tickedAt, 60_000);
    if (!callbackLine) {
      throw new Error('No /internal/tools/ request received within 60s — check LLM and BACKEND_URL');
    }
    ok(`callback received: ${callbackLine.slice(0, 140)}`);

    process.stdout.write('\n✅ Full round-trip confirmed: deliverTick → LLM → tool callback\n\n');
  } catch (err) {
    process.stdout.write(`\n❌ FAILED: ${(err as Error).message}\n`);
    process.exit(1);
  } finally {
    await cleanup(pool, containerId);
    await pool.end();
  }
}

main();
