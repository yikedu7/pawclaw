/**
 * E2E smoke test for fetchWalletAddress() against a local OrbStack VM.
 *
 * Prerequisites:
 *   - OrbStack VM 'hetzner-test' at 192.168.139.172, user 'deploy'
 *   - ghcr.io/openclaw/openclaw:latest pulled on the VM
 *   - DATABASE_URL pointing to running Supabase local
 *   - OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE set
 *
 * Run (from repo root):
 *   cd packages/backend && \
 *     HETZNER_HOST=192.168.139.172 HETZNER_USER=deploy \
 *     HETZNER_SSH_KEY="$(cat ~/.orbstack/ssh/id_ed25519)" \
 *     HETZNER_SSH_KEY_FILE=/tmp/hetzner-e2e-key \
 *     HETZNER_HOST_DATA_DIR=/data/pets \
 *     DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
 *     OKX_API_KEY=... OKX_SECRET_KEY=... OKX_PASSPHRASE=... \
 *     node_modules/.bin/tsx scripts/e2e-fetch-wallet.ts
 */

import pg from 'pg';
import Docker from 'dockerode';
import {
  createPetContainer,
  startContainer,
  fetchWalletAddress,
  removeContainer,
} from '../src/runtime/container.js';

const { Pool } = pg;

const PET_ID  = '00000000-e2e1-4000-a000-000000000001';
const OWNER_ID = '00000000-e2e1-4000-b000-000000000001';

function step(msg: string) { process.stdout.write(`\n▶ ${msg}\n`); }
function ok(msg: string)   { process.stdout.write(`  ✓ ${msg}\n`); }
function info(msg: string) { process.stdout.write(`  ℹ ${msg}\n`); }

async function cleanup(pool: InstanceType<typeof Pool>, containerId: string | null) {
  if (containerId) {
    try { await removeContainer(containerId); } catch {}
  }
  await pool.query('DELETE FROM port_allocations WHERE pet_id = $1', [PET_ID]);
  await pool.query('DELETE FROM pets WHERE id = $1', [PET_ID]);
  await pool.query('DELETE FROM auth.users WHERE id = $1', [OWNER_ID]);
}

async function main() {
  const required = ['DATABASE_URL', 'HETZNER_HOST', 'HETZNER_SSH_KEY', 'OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE'];
  for (const v of required) {
    if (!process.env[v]) throw new Error(`${v} is required`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let containerId: string | null = null;

  try {
    step('Seeding DB');
    await pool.query(`
      INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
      VALUES ($1, 'e2e-wallet@test.local', '$2a$10$fake', 'authenticated', 'authenticated',
              '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
      ON CONFLICT (id) DO NOTHING
    `, [OWNER_ID]);
    await pool.query(`
      INSERT INTO pets (id, owner_id, name, soul_md, skill_md)
      VALUES ($1, $2, 'WalletTestPet', '# You are a test pet.', '# no tools')
      ON CONFLICT (id) DO NOTHING
    `, [PET_ID, OWNER_ID]);
    ok('DB seeded');

    step('createPetContainer');
    const result = await createPetContainer(
      PET_ID,
      '# You are a wallet test pet.',
      '# no tools',
    );
    containerId = result.containerId;
    ok(`container created: ${containerId.slice(0, 12)}`);

    step('startContainer (wait for healthz)');
    await startContainer(containerId);
    ok('container healthy');

    step('fetchWalletAddress (install onchainos + login + addresses --chain 196)');
    info('This may take 30–60s for CLI install…');
    const startMs = Date.now();
    const address = await fetchWalletAddress(containerId);
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

    if (!address) {
      process.stdout.write(`\n❌ fetchWalletAddress returned null after ${elapsed}s\n\n`);

      // Print onchainos stdout for debugging
      const dockerHost = process.env.DOCKER_HOST;
      let docker: Docker;
      if (dockerHost?.startsWith('http://')) {
        const url = new URL(dockerHost);
        docker = new Docker({ protocol: 'http', host: url.hostname, port: parseInt(url.port, 10) });
      } else {
        docker = new Docker({
          protocol: 'ssh',
          host: process.env.HETZNER_HOST,
          port: 22,
          username: process.env.HETZNER_USER,
          sshOptions: { privateKey: process.env.HETZNER_SSH_KEY },
        } as ConstructorParameters<typeof Docker>[0]);
      }

      // Run addresses command manually and dump output
      const exec = await docker.getContainer(containerId).exec({
        Cmd: ['/home/node/.local/bin/onchainos', 'wallet', 'addresses', '--chain', '196'],
        AttachStdout: true,
        AttachStderr: true,
      });
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        exec.start({}, (_err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
          if (!stream) { resolve(); return; }
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('end', resolve);
          stream.on('error', resolve);
        });
      });
      const raw = Buffer.concat(chunks).toString('utf-8');
      process.stdout.write(`  onchainos output:\n${raw}\n`);
      process.exit(1);
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error(`Address format invalid: ${address}`);
    }

    ok(`wallet_address: ${address} (${elapsed}s)`);
    process.stdout.write('\n✅ fetchWalletAddress e2e passed\n\n');
  } catch (err) {
    process.stdout.write(`\n❌ FAILED: ${(err as Error).message}\n${(err as Error).stack}\n`);
    process.exit(1);
  } finally {
    step('Cleanup');
    await cleanup(pool, containerId);
    await pool.end();
    ok('done');
  }
}

main();
