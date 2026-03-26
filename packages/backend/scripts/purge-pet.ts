#!/usr/bin/env tsx
/**
 * purge-pet.ts — Remove a pet completely: kill Docker container + wipe DB records.
 *
 * Usage:
 *   DATABASE_URL=... HETZNER_HOST=... HETZNER_USER=... HETZNER_SSH_KEY=... \
 *     tsx packages/backend/scripts/purge-pet.ts <pet-id>
 *
 * Or with Railway env vars loaded:
 *   railway run tsx packages/backend/scripts/purge-pet.ts <pet-id>
 *
 * What it does:
 *   1. Looks up the pet row (container_id, container_port)
 *   2. Kills + removes the Docker container on Hetzner via SSH
 *   3. Releases the port_allocations row
 *   4. Deletes the pet row (cascades to diary_entries, social_events)
 */

import Docker from 'dockerode';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { pets, port_allocations } from '../src/db/schema.js';

const petId = process.argv[2];
if (!petId) {
  console.error('Usage: tsx purge-pet.ts <pet-id>');
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool);

async function main() {
  // 1. Fetch pet
  const [pet] = await db.select().from(pets).where(eq(pets.id, petId)).limit(1);
  if (!pet) {
    console.error(`Pet ${petId} not found in DB`);
    process.exit(1);
  }

  console.log(`Pet:          ${pet.name} (${petId})`);
  console.log(`Container ID: ${pet.container_id ?? '(none)'}`);
  console.log(`Port:         ${pet.container_port ?? '(none)'}`);
  console.log(`Status:       ${pet.container_status}`);

  // 2. Kill Docker container
  if (pet.container_id) {
    const docker = new Docker({
      protocol: 'ssh',
      host: process.env.HETZNER_HOST,
      port: 22,
      username: process.env.HETZNER_USER,
      sshOptions: { privateKey: process.env.HETZNER_SSH_KEY },
    } as ConstructorParameters<typeof Docker>[0]);

    try {
      const container = docker.getContainer(pet.container_id);
      const info = await container.inspect().catch(() => null);

      if (!info) {
        console.log('Container not found on Docker host (already gone)');
      } else {
        if (info.State.Running) {
          await container.stop({ t: 5 });
          console.log('Container stopped');
        }
        await container.remove({ force: true });
        console.log('Container removed');
      }
    } catch (err) {
      console.warn('Docker error (continuing):', (err as Error).message);
    }
  } else {
    console.log('No container_id — skipping Docker step');
  }

  // 3. Release port allocation
  const deleted = await db
    .delete(port_allocations)
    .where(eq(port_allocations.pet_id, petId))
    .returning();
  if (deleted.length > 0) {
    console.log(`Port allocation released: port ${deleted[0].port}`);
  } else {
    console.log('No port_allocations row found');
  }

  // 4. Delete pet (cascades to diary_entries, social_events)
  await db.delete(pets).where(eq(pets.id, petId));
  console.log('Pet deleted from DB');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => pool.end());
