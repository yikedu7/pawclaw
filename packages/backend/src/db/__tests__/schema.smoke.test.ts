import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pets, social_events, transactions } from '../schema.js';
import * as schema from '../schema.js';

const { Pool } = pg;

let pool: InstanceType<typeof Pool>;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');
  pool = new Pool({ connectionString: url });
  db = drizzle(pool, { schema });
  // Verify connection
  await pool.query('SELECT 1');
  // Seed auth.users required by pets FK
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES
      ('00000000-0000-0000-0000-000000000001', 'smoke-1@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', ''),
      ('00000000-0000-0000-0000-000000000002', 'smoke-2@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `);
});

afterAll(async () => {
  await pool.end();
});

describe('schema smoke tests', () => {
  it('inserts a pet and reads it back with correct defaults', async () => {
    const [pet] = await db
      .insert(pets)
      .values({
        owner_id: '00000000-0000-0000-0000-000000000001',
        name: 'TestPet',
        soul_md: 'A curious fox.',
        skill_md: 'Can run and jump.',
      })
      .returning();

    expect(pet.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(pet.affection).toBe(0);
  });

  it('inserts a social_events row referencing an existing pet (FK works)', async () => {
    const [pet] = await db
      .insert(pets)
      .values({
        owner_id: '00000000-0000-0000-0000-000000000002',
        name: 'SocialPet',
        soul_md: 'Friendly.',
        skill_md: 'Waves paw.',
      })
      .returning();

    const [event] = await db
      .insert(social_events)
      .values({
        from_pet_id: pet.id,
        type: 'visit',
      })
      .returning();

    expect(event.id).toBeDefined();
    expect(event.from_pet_id).toBe(pet.id);
  });

  it('inserts a transactions row with x_layer_confirmed defaulting to false', async () => {
    const [tx] = await db
      .insert(transactions)
      .values({
        from_wallet: '0xABC',
        to_wallet: '0xDEF',
        amount: '1000000000000000000',
        token: 'OKB',
        tx_hash: '0xdeadbeef' + Math.random().toString(36).slice(2),
      })
      .returning();

    expect(tx.x_layer_confirmed).toBe(false);
  });

  it('rejects social_events with a non-existent from_pet_id (FK violation)', async () => {
    await expect(
      db.insert(social_events).values({
        from_pet_id: '99999999-9999-9999-9999-999999999999',
        type: 'gift',
      }),
    ).rejects.toThrow();
  });
});
