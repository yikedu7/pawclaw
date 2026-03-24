/**
 * End-to-end smoke test for container.ts against a local OrbStack VM.
 *
 * Prerequisites:
 *   - OrbStack VM 'hetzner-test' provisioned and SSH accessible
 *   - DATABASE_URL pointing to running Supabase local
 *   - HETZNER_HOST / HETZNER_USER / HETZNER_SSH_KEY / HETZNER_HOST_DATA_DIR set
 *
 * Run:
 *   tsx packages/backend/scripts/e2e-container.ts
 */

import pg from 'pg';
import {
  createPetContainer,
  startContainer,
  getContainerStatus,
  stopContainer,
  removeContainer,
} from '../src/runtime/container.js';

const { Pool } = pg;

const PET_ID = '00000000-e2e0-4000-a000-000000000001';
const OWNER_ID = '00000000-e2e0-4000-b000-000000000001';

async function seedAuthUser(pool: InstanceType<typeof Pool>) {
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'e2e-container@test.local', '$2a$10$fake', 'authenticated', 'authenticated',
            '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_ID]);
}

async function seedPet(pool: InstanceType<typeof Pool>) {
  await pool.query(`
    INSERT INTO pets (id, owner_id, name, soul_md, skill_md)
    VALUES ($1, $2, 'E2EPet', '# You are a test pet.', '# tools')
    ON CONFLICT (id) DO NOTHING
  `, [PET_ID, OWNER_ID]);
}

async function cleanup(pool: InstanceType<typeof Pool>, containerId: string | null) {
  if (containerId) {
    try { await removeContainer(containerId); } catch {}
  }
  await pool.query('DELETE FROM port_allocations WHERE pet_id = $1', [PET_ID]);
  await pool.query('DELETE FROM pets WHERE id = $1', [PET_ID]);
  await pool.query('DELETE FROM auth.users WHERE id = $1', [OWNER_ID]);
}

function step(msg: string) {
  process.stdout.write(`\n▶ ${msg}\n`);
}

function ok(msg: string) {
  process.stdout.write(`  ✓ ${msg}\n`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  if (!process.env.HETZNER_HOST) throw new Error('HETZNER_HOST required');
  if (!process.env.HETZNER_SSH_KEY) throw new Error('HETZNER_SSH_KEY required');

  const pool = new Pool({ connectionString: url });
  let containerId: string | null = null;

  try {
    step('Seeding DB');
    await seedAuthUser(pool);
    await seedPet(pool);
    ok('auth.users + pets rows created');

    step('createPetContainer');
    const result = await createPetContainer(
      PET_ID,
      '# You are a cheerful test cat named E2EPet.',
      '# no tools',
    );
    containerId = result.containerId;
    ok(`containerId: ${result.containerId}`);
    ok(`containerPort: ${result.containerPort}`);
    ok(`gatewayToken: ${result.gatewayToken.slice(0, 8)}...`);

    // Verify DB was updated
    const { rows } = await pool.query(
      'SELECT container_id, container_port, container_status, gateway_token FROM pets WHERE id = $1',
      [PET_ID],
    );
    if (rows[0].container_status !== 'starting') throw new Error(`Expected status=starting, got ${rows[0].container_status}`);
    if (rows[0].container_id !== containerId) throw new Error('container_id mismatch in DB');
    ok('DB row: container_status=starting ✓');

    // Verify port_allocations row
    const { rows: ports } = await pool.query(
      'SELECT port FROM port_allocations WHERE pet_id = $1 AND released_at IS NULL',
      [PET_ID],
    );
    if (!ports.length) throw new Error('No port_allocations row found');
    ok(`port_allocations: port=${ports[0].port} ✓`);

    // Verify files were written on VM
    const { execSync } = await import('child_process');
    const dataDir = process.env.HETZNER_HOST_DATA_DIR ?? '/data/pets';
    const files = [
      `${dataDir}/${PET_ID}/config/openclaw.json`,
      `${dataDir}/${PET_ID}/workspace/SOUL.md`,
      `${dataDir}/${PET_ID}/workspace/HEARTBEAT.md`,
      `${dataDir}/${PET_ID}/workspace/skills/pawclaw/SKILL.md`,
    ];
    const sshKeyFile = process.env.HETZNER_SSH_KEY_FILE ?? '/tmp/hetzner-test-key';
    for (const f of files) {
      const out = execSync(
        `ssh -i ${sshKeyFile} -o StrictHostKeyChecking=no deploy@${process.env.HETZNER_HOST} "test -f '${f}' && echo exists"`,
      ).toString().trim();
      if (out !== 'exists') throw new Error(`File not found on VM: ${f}`);
      ok(`${f.split('/').slice(-1)[0]} written ✓`);
    }

    step('startContainer');
    await startContainer(containerId);
    ok('startContainer completed (healthz polled)');

    const { rows: afterStart } = await pool.query(
      'SELECT container_status FROM pets WHERE id = $1',
      [PET_ID],
    );
    if (afterStart[0].container_status !== 'running') throw new Error(`Expected status=running, got ${afterStart[0].container_status}`);
    ok('DB row: container_status=running ✓');

    step('getContainerStatus');
    const status = await getContainerStatus(containerId);
    if (status !== 'running') throw new Error(`Expected running, got ${status}`);
    ok(`getContainerStatus: ${status} ✓`);

    step('stopContainer');
    await stopContainer(containerId);
    const statusAfterStop = await getContainerStatus(containerId);
    if (statusAfterStop !== 'stopped') throw new Error(`Expected stopped, got ${statusAfterStop}`);
    ok(`stopped, getContainerStatus: ${statusAfterStop} ✓`);

    step('removeContainer');
    await removeContainer(containerId);
    const statusAfterRemove = await getContainerStatus(containerId);
    if (statusAfterRemove !== 'missing') throw new Error(`Expected missing, got ${statusAfterRemove}`);
    containerId = null;
    ok(`removed, getContainerStatus: ${statusAfterRemove} ✓`);

    // Verify port released
    const { rows: releasedPorts } = await pool.query(
      'SELECT released_at FROM port_allocations WHERE pet_id = $1',
      [PET_ID],
    );
    if (!releasedPorts[0].released_at) throw new Error('Port not released in port_allocations');
    ok('port_allocations.released_at set ✓');

    process.stdout.write('\n✅ All e2e checks passed\n\n');
  } catch (err) {
    process.stdout.write(`\n❌ FAILED: ${(err as Error).message}\n`);
    process.exit(1);
  } finally {
    await cleanup(pool, containerId);
    await pool.end();
  }
}

main();
