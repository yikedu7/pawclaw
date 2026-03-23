import Docker from 'dockerode';
import { Client as SshClient } from 'ssh2';
import { db } from '../db/client.js';
import { pets, port_allocations } from '../db/schema.js';
import { eq, isNull, sql } from 'drizzle-orm';

// ── Docker client (SSH tunnel to Hetzner) ────────────────────────────────────

function getDocker(): Docker {
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

async function sshWriteFiles(files: Array<{ path: string; content: string }>): Promise<void> {
  const host = process.env.HETZNER_HOST;
  const username = process.env.HETZNER_USER;
  const privateKey = process.env.HETZNER_SSH_KEY;

  if (!host || !username || !privateKey) {
    throw new Error('HETZNER_HOST, HETZNER_USER, HETZNER_SSH_KEY must be set');
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
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';

  const gatewayToken = crypto.randomUUID();
  const webhookToken = crypto.randomUUID();

  // 1. Allocate port
  const { port: containerPort } = await allocatePort(petId);
  const portIndex = containerPort - 19000;

  // 2. Generate heartbeat md
  const { generateConfigJson } = await import('./config-generator.js');
  const { generateHeartbeatMd } = await import('./heartbeat-generator.js');

  // Fetch pet stats for heartbeat generation
  const [pet] = await db.select().from(pets).where(eq(pets.id, petId)).limit(1);
  if (!pet) throw new Error(`Pet ${petId} not found`);

  const configJson = generateConfigJson({ id: petId, backendUrl, webhookToken, gatewayToken });
  const heartbeatMd = generateHeartbeatMd({ name: pet.name, hunger: pet.hunger, mood: pet.mood, affection: pet.affection });

  // 3. Write files to Hetzner via SSH
  await sshWriteFiles([
    { path: `${dataDir}/${petId}/config/openclaw.json`, content: configJson },
    { path: `${dataDir}/${petId}/workspace/SOUL.md`, content: soulMd },
    { path: `${dataDir}/${petId}/workspace/HEARTBEAT.md`, content: heartbeatMd },
    { path: `${dataDir}/${petId}/workspace/skills/x-pet/SKILL.md`, content: skillMd },
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
      Memory: 512 * 1024 * 1024,
    },
    Env: [
      `OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
      'HOME=/home/node',
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
 * Starts a stopped container and polls /healthz until 200 or 30s timeout,
 * then sets container_status = 'running'.
 */
export async function startContainer(containerId: string): Promise<void> {
  const docker = getDocker();
  await docker.getContainer(containerId).start();

  // Health check: poll GET http://{host}:{port}/healthz
  const [pet] = await db
    .select({ host: pets.container_host, port: pets.container_port, id: pets.id })
    .from(pets)
    .where(eq(pets.container_id, containerId))
    .limit(1);

  if (!pet || !pet.host || !pet.port) {
    throw new Error(`No pet found with containerId ${containerId}`);
  }

  const healthUrl = `http://${pet.host}:${pet.port}/healthz`;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        await db
          .update(pets)
          .set({ container_status: 'running' })
          .where(eq(pets.container_id, containerId));
        return;
      }
    } catch {
      // container not ready yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`Container ${containerId} did not become healthy within 30s`);
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
