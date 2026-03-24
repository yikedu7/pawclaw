import Docker from 'dockerode';
import { Client as SshClient } from 'ssh2';
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { db } from '../db/client.js';
import { pets, port_allocations } from '../db/schema.js';
import { eq, isNull, sql } from 'drizzle-orm';

const OKX_SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'okx-skills');

/**
 * Load all OKX skill SKILL.md files from the bundled static directory.
 * Skills are checked in under src/runtime/okx-skills/ — no GitHub API, no rate limits.
 */
async function loadOkxSkills(): Promise<Array<{ name: string; content: string }>> {
  const entries = await readdir(OKX_SKILLS_DIR, { withFileTypes: true });
  const skillDirs = entries.filter((e) => e.isDirectory());
  const results = await Promise.all(
    skillDirs.map(async ({ name }) => {
      try {
        const content = await readFile(join(OKX_SKILLS_DIR, name, 'SKILL.md'), 'utf-8');
        return { name, content };
      } catch {
        return null; // skip if no SKILL.md
      }
    }),
  );
  return results.filter((s): s is { name: string; content: string } => s !== null);
}

// ── Docker client (SSH tunnel to Hetzner) ────────────────────────────────────

/**
 * Returns a Docker client connected to the Hetzner VPS.
 *
 * Two connection modes:
 * - DOCKER_HOST=http://localhost:<port> — Use a pre-established SSH tunnel
 *   (e.g. `ssh -N -L 2375:/var/run/docker.sock deploy@<host>`). This avoids
 *   Node.js TCP limitations on macOS when connecting to virtualised subnets.
 * - Default — Direct SSH via dockerode (works on Linux/Railway where Node.js
 *   can TCP-connect to the remote host).
 */
function getDocker(): Docker {
  const dockerHost = process.env.DOCKER_HOST;
  if (dockerHost) {
    // Parse http://localhost:PORT or unix socket path
    if (dockerHost.startsWith('http://') || dockerHost.startsWith('https://')) {
      const url = new URL(dockerHost);
      return new Docker({
        protocol: url.protocol.replace(':', '') as 'http' | 'https',
        host: url.hostname,
        port: parseInt(url.port, 10),
      });
    }
    // unix socket
    return new Docker({ socketPath: dockerHost.replace('unix://', '') });
  }

  return new Docker({
    protocol: 'ssh',
    host: process.env.HETZNER_HOST,
    port: 22,
    username: process.env.HETZNER_USER,
    sshOptions: {
      privateKey: process.env.HETZNER_SSH_KEY,
    },
  } as ConstructorParameters<typeof Docker>[0]);
}

// ── SSH file helpers ─────────────────────────────────────────────────────────

/**
 * Write files to the remote host via SSH.
 *
 * When HETZNER_SSH_KEY_FILE is set (a path to a PEM key file), the function
 * uses the system `ssh` / `scp` binaries via child_process. This is needed on
 * macOS where Node.js cannot TCP-connect to virtualised subnets (e.g. OrbStack)
 * but system binaries can. On Linux/Railway, HETZNER_SSH_KEY (inline PEM) is
 * used directly via the ssh2 library.
 */
async function sshWriteFiles(files: Array<{ path: string; content: string }>): Promise<void> {
  const host = process.env.HETZNER_HOST;
  const username = process.env.HETZNER_USER;
  const keyFile = process.env.HETZNER_SSH_KEY_FILE;
  const privateKey = process.env.HETZNER_SSH_KEY;

  if (!host || !username) {
    throw new Error('HETZNER_HOST, HETZNER_USER must be set');
  }

  // ── Path A: system SSH binary (macOS local dev with HETZNER_SSH_KEY_FILE) ──
  if (keyFile) {
    const exec = (cmd: string, args: string[]) =>
      new Promise<void>((resolve, reject) => {
        execFile(cmd, args, (err) => (err ? reject(err) : resolve()));
      });

    const sshArgs = [
      '-i', keyFile,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'BatchMode=yes',
      `${username}@${host}`,
    ];

    for (const { path: filePath, content } of files) {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      // mkdir -p on remote
      await exec('ssh', [...sshArgs, `mkdir -p "${dir}"`]);
      // Write content via temp file + scp
      const tmp = join(tmpdir(), `openclaw-upload-${Date.now()}.tmp`);
      await writeFile(tmp, content, 'utf-8');
      try {
        await exec('scp', [
          '-i', keyFile,
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'BatchMode=yes',
          tmp,
          `${username}@${host}:${filePath}`,
        ]);
      } finally {
        await unlink(tmp).catch(() => {});
      }
    }
    return;
  }

  // ── Path B: ssh2 library (Linux/Railway with inline HETZNER_SSH_KEY) ────────
  if (!privateKey) {
    throw new Error('Either HETZNER_SSH_KEY or HETZNER_SSH_KEY_FILE must be set');
  }

  await new Promise<void>((resolve, reject) => {
    const ssh = new SshClient();

    ssh.on('ready', () => {
      ssh.sftp((err, sftp) => {
        if (err) { ssh.end(); return reject(err); }

        const writeAll = async () => {
          for (const { path: filePath, content } of files) {
            // mkdir -p equivalent: ensure parent dirs exist
            const dir = filePath.substring(0, filePath.lastIndexOf('/'));
            await new Promise<void>((res, rej) => {
              ssh.exec(`mkdir -p "${dir}"`, (execErr, stream) => {
                if (execErr) return rej(execErr);
                stream.on('close', () => res()).resume();
              });
            });

            await new Promise<void>((res, rej) => {
              const writeStream = sftp.createWriteStream(filePath);
              writeStream.on('close', res);
              writeStream.on('error', rej);
              writeStream.end(content, 'utf-8');
            });
          }
        };

        writeAll()
          .then(() => { sftp.end(); ssh.end(); resolve(); })
          .catch((writeErr) => { ssh.end(); reject(writeErr); });
      });
    });

    ssh.on('error', reject);

    ssh.connect({ host, port: 22, username, privateKey });
  });
}

// ── Port allocation ───────────────────────────────────────────────────────────

/**
 * Allocates the next free port from 19000–19999.
 * Uses a DB-level uniqueness constraint on port_allocations.port to prevent
 * race conditions on concurrent pet creation.
 * Returns the allocated row id and port number.
 */
async function allocatePort(petId: string): Promise<{ allocationId: string; port: number }> {
  // Find lowest available port_index not currently in use
  const result = await db.execute<{ port: number }>(sql`
    WITH next_port AS (
      SELECT (19000 + (generate_series % 1000)) AS port
      FROM generate_series(0, 999)
      WHERE (19000 + (generate_series % 1000)) NOT IN (
        SELECT port FROM port_allocations WHERE released_at IS NULL
      )
      ORDER BY port
      LIMIT 1
    )
    INSERT INTO port_allocations (pet_id, port)
    SELECT ${petId}::uuid, port FROM next_port
    RETURNING port
  `);

  const row = result.rows[0];
  if (!row) {
    throw new Error('No free ports available in range 19000–19999');
  }

  // Fetch the inserted row id
  const [allocation] = await db
    .select()
    .from(port_allocations)
    .where(eq(port_allocations.pet_id, petId))
    .limit(1);

  if (!allocation) throw new Error('Port allocation insert failed');

  return { allocationId: allocation.id, port: row.port };
}

// ── Public API ────────────────────────────────────────────────────────────────

export type CreateContainerResult = {
  containerId: string;
  containerPort: number;
  gatewayToken: string;
};

/**
 * Creates a Docker container for the given pet on the Hetzner VPS.
 * Writes config/workspace files via SSH, creates the container, stores
 * containerId/containerPort/gatewayToken in the pets row, and sets
 * container_status = 'starting'.
 */
export async function createPetContainer(
  petId: string,
  soulMd: string,
  skillMd: string,
): Promise<CreateContainerResult> {
  const dataDir = process.env.HETZNER_HOST_DATA_DIR ?? '/data/pets';

  const gatewayToken = crypto.randomUUID();

  // 1. Allocate port
  const { port: containerPort } = await allocatePort(petId);
  const portIndex = containerPort - 19000;

  // 2. Generate heartbeat md
  const { generateConfigJson } = await import('./config-generator.js');
  const { generateHeartbeatMd } = await import('./heartbeat-generator.js');

  // Fetch pet stats for heartbeat generation
  const [pet] = await db.select().from(pets).where(eq(pets.id, petId)).limit(1);
  if (!pet) throw new Error(`Pet ${petId} not found`);

  const configJson = generateConfigJson({
    gatewayToken,
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
  });
  const heartbeatMd = generateHeartbeatMd({ name: pet.name, hunger: pet.hunger, mood: pet.mood, affection: pet.affection });

  // 3. Fetch all OKX skills and write everything to Hetzner via SSH
  const okxSkills = await loadOkxSkills();

  await sshWriteFiles([
    { path: `${dataDir}/${petId}/config/openclaw.json`, content: configJson },
    { path: `${dataDir}/${petId}/workspace/SOUL.md`, content: soulMd },
    { path: `${dataDir}/${petId}/workspace/HEARTBEAT.md`, content: heartbeatMd },
    { path: `${dataDir}/${petId}/workspace/skills/x-pet/SKILL.md`, content: skillMd },
    // All OKX skills — LLM agent reads these to autonomously operate wallet, swap, payments, etc.
    ...okxSkills.map(({ name, content }) => ({
      path: `${dataDir}/${petId}/workspace/skills/${name}/SKILL.md`,
      content,
    })),
  ]);

  // 4. Create Docker container
  const docker = getDocker();
  const container = await docker.createContainer({
    Image: 'ghcr.io/openclaw/openclaw:latest',
    HostConfig: {
      Binds: [
        `${dataDir}/${petId}/config:/home/node/.openclaw`,
        `${dataDir}/${petId}/workspace:/home/node/.openclaw/workspace`,
      ],
      PortBindings: { '18789/tcp': [{ HostPort: String(containerPort) }] },
      RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 3 },
      Memory: 2048 * 1024 * 1024,
      // onchainos CLI uses linux-keyutils (add_key syscall) to store session tokens.
      // Docker's default seccomp profile blocks add_key, causing wallet login to fail.
      // seccomp=unconfined lifts this restriction so onchainos can run inside the container.
      SecurityOpt: ['seccomp=unconfined'],
    },
    Env: [
      `OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
      ...(process.env.ANTHROPIC_BASE_URL ? [`ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL}`] : []),
      // OKX Onchain OS credentials — required by the onchainos CLI inside the container
      // for wallet login and x402-pay (see packages/openclaw/src/onchain/wallet.ts)
      `OKX_API_KEY=${process.env.OKX_API_KEY ?? ''}`,
      `OKX_SECRET_KEY=${process.env.OKX_SECRET_KEY ?? ''}`,
      `OKX_PASSPHRASE=${process.env.OKX_PASSPHRASE ?? ''}`,
      'HOME=/home/node',
      'OPENCLAW_NO_RESPAWN=1',
      'NODE_OPTIONS=--max-old-space-size=1536',
    ],
  });

  const containerId = container.id;

  // 5. Persist to DB
  await db
    .update(pets)
    .set({
      container_id: containerId,
      container_host: process.env.HETZNER_HOST,
      container_port: containerPort,
      container_status: 'starting',
      gateway_token: gatewayToken,
      port_index: portIndex,
    })
    .where(eq(pets.id, petId));

  return { containerId, containerPort, gatewayToken };
}

/**
 * Starts a container and waits until the OpenClaw gateway is ready.
 *
 * The Docker image healthcheck interval is 180s which is too long to wait.
 * Instead we directly probe the gateway by running the same healthz fetch
 * command via `docker exec` every 2s (up to 60s). The gateway binds to
 * 127.0.0.1:18789 inside the container so exec is the only way to reach it.
 */
export async function startContainer(containerId: string): Promise<void> {
  const docker = getDocker();
  await docker.getContainer(containerId).start();

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    const info = await docker.getContainer(containerId).inspect();
    if (info.State.Status === 'exited') {
      throw new Error(`Container ${containerId} exited unexpectedly (exit code ${info.State.ExitCode})`);
    }

    // If Docker already marked it healthy, we're done.
    if (info.State.Health?.Status === 'healthy') break;

    // Probe via exec — same command as the image healthcheck.
    try {
      const exec = await docker.getContainer(containerId).exec({
        Cmd: ['curl', '-sf', 'http://127.0.0.1:18789/healthz'],
        AttachStdout: false,
        AttachStderr: false,
      });
      await new Promise<void>((resolve, reject) => {
        exec.start({}, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
          if (err) return reject(err);
          stream?.resume();
          stream?.on('end', resolve);
          stream?.on('error', reject);
          if (!stream) resolve();
        });
      });
      const execInfo = await exec.inspect();
      if (execInfo.ExitCode === 0) break; // gateway is up
    } catch {
      // container not ready yet — keep polling
    }
  }

  if (Date.now() >= deadline) {
    throw new Error(`Container ${containerId} did not become healthy within 60s`);
  }

  await db
    .update(pets)
    .set({ container_status: 'running' })
    .where(eq(pets.container_id, containerId));
}

/**
 * Stops a running container and sets container_status = 'stopped'.
 */
export async function stopContainer(containerId: string): Promise<void> {
  const docker = getDocker();
  await docker.getContainer(containerId).stop();

  await db
    .update(pets)
    .set({ container_status: 'stopped' })
    .where(eq(pets.container_id, containerId));
}

/**
 * Removes a container and releases its port allocation.
 */
export async function removeContainer(containerId: string): Promise<void> {
  const docker = getDocker();
  await docker.getContainer(containerId).remove({ force: true });

  // Release port allocation
  const [pet] = await db
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.container_id, containerId))
    .limit(1);

  if (pet) {
    await db
      .update(port_allocations)
      .set({ released_at: new Date() })
      .where(eq(port_allocations.pet_id, pet.id));

    await db
      .update(pets)
      .set({ container_status: 'deleted' })
      .where(eq(pets.id, pet.id));
  }
}

/**
 * Delivers a tick to an OpenClaw container via its `/v1/chat/completions`
 * HTTP endpoint, triggered by running curl inside the container via docker exec.
 *
 * Why /v1/chat/completions instead of system event:
 * - `openclaw system event` enqueues a heartbeat event but the LLM may not
 *   treat the injected text as a "tick" and returns HEARTBEAT_OK silently.
 * - /v1/chat/completions sends an explicit user message directly to the agent,
 *   so the LLM receives the tick payload as a user turn and can call tools.
 *
 * The gateway must have `gateway.http.endpoints.chatCompletions.enabled: true`
 * (set by generateConfigJson). The endpoint binds to loopback so we reach it
 * via docker exec curl, not from outside the container.
 *
 * @param containerId  Docker container id.
 * @param gatewayToken OpenClaw gateway token (from pets.gateway_token).
 * @param payload      Tick context (pet state, nearby pets, recent events).
 */
export async function deliverTick(
  containerId: string,
  gatewayToken: string,
  payload: object,
): Promise<void> {
  const docker = getDocker();
  const container = docker.getContainer(containerId);

  const body = JSON.stringify({
    model: 'openclaw:main',
    messages: [{ role: 'user', content: `tick: ${JSON.stringify(payload)}` }],
    stream: false,
  });

  const exec = await container.exec({
    Cmd: [
      'curl', '-s', '-X', 'POST',
      'http://localhost:18789/v1/chat/completions',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${gatewayToken}`,
      '-d', body,
    ],
    AttachStdout: true,
    AttachStderr: true,
  });

  await new Promise<void>((resolve, reject) => {
    exec.start({}, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
      if (err) return reject(err);
      if (!stream) return reject(new Error('exec start returned no stream'));
      stream.resume(); // drain so the stream ends
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  });

  const info = await exec.inspect();
  if (info.ExitCode !== 0) {
    throw new Error(`deliverTick exec exited ${info.ExitCode} for container ${containerId}`);
  }
}

/**
 * Sends a user chat message to the container and returns the assistant reply text.
 * Uses docker exec + curl to /v1/chat/completions and captures stdout.
 */
export async function containerChat(
  containerId: string,
  gatewayToken: string,
  message: string,
  state: object,
): Promise<string> {
  const docker = getDocker();
  const container = docker.getContainer(containerId);

  const body = JSON.stringify({
    model: 'openclaw:main',
    messages: [{ role: 'user', content: `user_message: ${message}\nstate: ${JSON.stringify(state)}` }],
    stream: false,
  });

  const exec = await container.exec({
    Cmd: [
      'curl', '-s', '-X', 'POST',
      'http://localhost:18789/v1/chat/completions',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${gatewayToken}`,
      '-d', body,
    ],
    AttachStdout: true,
    AttachStderr: true,
  });

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    exec.start({}, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
      if (err) return reject(err);
      if (!stream) return reject(new Error('exec start returned no stream'));
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  });

  // Docker multiplexes stdout/stderr: each frame has an 8-byte header (first byte = stream type, bytes 4-7 = length)
  const raw = Buffer.concat(chunks);
  let text = '';
  let offset = 0;
  while (offset + 8 <= raw.length) {
    const size = raw.readUInt32BE(offset + 4);
    text += raw.slice(offset + 8, offset + 8 + size).toString('utf-8');
    offset += 8 + size;
  }
  if (!text) text = raw.toString('utf-8');

  const json = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? '...';
}

// ── Docker exec helper ────────────────────────────────────────────────────────

/**
 * Runs a command inside a container via docker exec and returns the exit code
 * and demultiplexed stdout text.
 */
async function dockerExec(
  container: Docker.Container,
  cmd: string[],
): Promise<{ exitCode: number; stdout: string }> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    exec.start({}, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
      if (err) return reject(err);
      if (!stream) return reject(new Error('exec start returned no stream'));
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  });

  const info = await exec.inspect();

  // Docker multiplexes stdout/stderr: demux using the 8-byte frame header
  const raw = Buffer.concat(chunks);
  let text = '';
  let offset = 0;
  while (offset + 8 <= raw.length) {
    const size = raw.readUInt32BE(offset + 4);
    text += raw.slice(offset + 8, offset + 8 + size).toString('utf-8');
    offset += 8 + size;
  }
  if (!text) text = raw.toString('utf-8');

  return { exitCode: info.ExitCode ?? -1, stdout: text };
}

/**
 * Fetches the EVM wallet address assigned by the Onchain OS inside a container.
 *
 * Three steps:
 *   1. Install the `onchainos` CLI via curl (binary lands at /home/node/.local/bin/onchainos).
 *   2. Silent login — OKX_API_KEY/OKX_SECRET_KEY/OKX_PASSPHRASE are already set as env vars.
 *   3. Fetch the X Layer (chain 196) address — retried every 3s for up to 30s.
 *
 * Returns null if no address is found within the timeout.
 */
export async function fetchWalletAddress(containerId: string): Promise<string | null> {
  const docker = getDocker();
  const container = docker.getContainer(containerId);
  const bin = '/home/node/.local/bin/onchainos';

  // Step 1 — install onchainos from the latest GitHub release
  await dockerExec(container, [
    'sh', '-c',
    // Use grep+sed to extract tag_name — avoids node quote-escaping issues inside sh -c.
    'curl -sSL "https://api.github.com/repos/okx/onchainos-skills/releases/latest"' +
    ' | grep \'"tag_name"\'' +
    ' | sed \'s/.*"tag_name": *"\\([^"]*\\)".*/\\1/\'' +
    ' | xargs -I TAG sh -c \'curl -sSL "https://raw.githubusercontent.com/okx/onchainos-skills/TAG/install.sh" | sh\'',
  ]);

  // Step 2 — silent login using OKX_* env vars already present in the container
  await dockerExec(container, [bin, 'wallet', 'login']);

  // Step 3 — fetch address, retry for up to 30s (wallet may initialise asynchronously)
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const { exitCode, stdout } = await dockerExec(container, [
        bin, 'wallet', 'addresses', '--chain', '196',
      ]);
      if (exitCode === 0) {
        const match = stdout.match(/0x[0-9a-fA-F]{40}/);
        if (match) return match[0];
      }
    } catch {
      // not ready yet — keep retrying
    }

    if (Date.now() + 3000 < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      break;
    }
  }

  return null;
}

/**
 * Returns the current status of a container: running, stopped, or missing.
 */
export async function getContainerStatus(
  containerId: string,
): Promise<'running' | 'stopped' | 'missing'> {
  const docker = getDocker();
  try {
    const info = await docker.getContainer(containerId).inspect();
    return info.State.Running ? 'running' : 'stopped';
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404) return 'missing';
    throw err;
  }
}
