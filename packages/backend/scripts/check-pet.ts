#!/usr/bin/env tsx
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { pets } from '../src/db/schema.js';

const petId = process.argv[2];
if (!petId) { console.error('Usage: tsx check-pet.ts <pet-id>'); process.exit(1); }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool);

async function main() {
  const [p] = await db.select().from(pets).where(eq(pets.id, petId)).limit(1);
  if (!p) { console.error('Pet not found'); process.exit(1); }
  console.log(JSON.stringify({
    name: p.name,
    container_id: p.container_id,
    container_status: p.container_status,
    container_port: p.container_port,
    wallet_address: p.wallet_address,
  }, null, 2));
}

main().catch(console.error).finally(() => pool.end());
