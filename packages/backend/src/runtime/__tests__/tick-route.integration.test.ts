import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerTickRoute } from '../tick-route.js';

const { Pool } = pg;

const OWNER_ID = '00000000-cccc-4000-c000-000000000001';

let pool: InstanceType<typeof Pool>;
let app: FastifyInstance;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Seed auth.users row so FK constraints are satisfied if we create pets
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'tick-test@test.local', '$2a$10$fake', 'authenticated', 'authenticated',
            '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_ID]);

  app = Fastify();
  await registerTickRoute(app);
  await app.ready();
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER_ID]);
  await pool.end();
  await app.close();
});

describe('POST /internal/tick/:petId', () => {
  it('returns 400 for a non-UUID petId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/tick/not-a-uuid',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ ok: false, error: expect.stringContaining('UUID') });
  });

  it('returns 500 for a valid UUID that does not exist in DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/tick/00000000-dead-4000-beef-000000000000',
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ ok: false, error: expect.stringContaining('not found') });
  });

  it('inserts a pet then tick returns 200 with an action (requires ANTHROPIC_API_KEY)', async () => {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-placeholder')) {
      process.stdout.write('Skipping LLM tick test — no real ANTHROPIC_API_KEY set\n');
      return;
    }

    const { rows } = await pool.query<{ id: string }>(`
      INSERT INTO pets (owner_id, name, soul_md, skill_md)
      VALUES ($1, 'TickPet', 'You are a cheerful cat.', '# tools')
      RETURNING id
    `, [OWNER_ID]);
    const petId = rows[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/internal/tick/${petId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, action: expect.any(String) });
  });
});
