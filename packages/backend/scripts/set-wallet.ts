#!/usr/bin/env tsx
import pkg from 'pg';
const { Pool } = pkg;
const [petId, address] = process.argv.slice(2);
if (!petId || !address) { console.error('Usage: tsx set-wallet.ts <pet-id> <address>'); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
async function main() {
  const r = await pool.query("UPDATE pets SET wallet_address = $1 WHERE id = $2 RETURNING name", [address, petId]);
  console.log(`Updated ${r.rows[0]?.name ?? '(not found)'} → ${address}`);
}
main().catch(console.error).finally(() => pool.end());
