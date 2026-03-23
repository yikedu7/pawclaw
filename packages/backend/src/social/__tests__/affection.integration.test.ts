import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pg from 'pg';
import { applyVisitAffection } from '../affection.js';
import { tickBus } from '../../runtime/tick-bus.js';
import type { WsEvent } from '@x-pet/shared';

const { Pool } = pg;

const OWNER_ID = '00000000-afec-4000-a000-000000000001';
const FRIEND_THRESHOLD = 100;

let pool: InstanceType<typeof Pool>;
let petId: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required — run: supabase start && supabase db reset');

  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');

  // Seed auth.users row
  await pool.query(`
    INSERT INTO auth.users (id, email, encrypted_password, aud, role, instance_id, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new)
    VALUES ($1, 'affection-test@test.local', '$2a$10$fake', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now(), '', '', '')
    ON CONFLICT (id) DO NOTHING
  `, [OWNER_ID]);

  // Seed a pet
  const { rows } = await pool.query<{ id: string }>(`
    INSERT INTO pets (owner_id, name, soul_md, skill_md, affection)
    VALUES ($1, 'AffectionPet', 'You are a test pet.', '# tools', 0)
    RETURNING id
  `, [OWNER_ID]);
  petId = rows[0].id;
});

afterAll(async () => {
  await pool.query('DELETE FROM pets WHERE owner_id = $1', [OWNER_ID]);
  await pool.end();
});

describe('applyVisitAffection', () => {
  it('increments affection in the DB', async () => {
    await applyVisitAffection(petId, OWNER_ID, 0);
    const { rows } = await pool.query<{ affection: number }>(
      'SELECT affection FROM pets WHERE id = $1',
      [petId],
    );
    expect(rows[0].affection).toBe(5);
  });

  it('does not emit friend.unlocked below threshold', async () => {
    const handler = vi.fn();
    tickBus.on('ownerEvent', handler);

    // affection is 5 after previous test; jump to 90
    await pool.query('UPDATE pets SET affection = 90 WHERE id = $1', [petId]);
    await applyVisitAffection(petId, OWNER_ID, 90); // → 95, still below 100

    tickBus.off('ownerEvent', handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it('emits friend.unlocked with pet_name when threshold is crossed', async () => {
    const events: [string, WsEvent][] = [];
    const handler = (ownerId: string, event: WsEvent) => events.push([ownerId, event]);
    tickBus.on('ownerEvent', handler);

    // affection is 95 after previous test
    await applyVisitAffection(petId, OWNER_ID, 95); // → 100, crosses threshold

    tickBus.off('ownerEvent', handler);

    expect(events).toHaveLength(1);
    const [ownerId, event] = events[0];
    expect(ownerId).toBe(OWNER_ID);
    expect(event.type).toBe('friend.unlocked');
    if (event.type === 'friend.unlocked') {
      expect(event.data.pet_id).toBe(petId);
      expect(event.data.owner_id).toBe(OWNER_ID);
      expect(event.data.pet_name).toBe('AffectionPet');
    }
  });

  it('does not re-emit friend.unlocked when already above threshold', async () => {
    const handler = vi.fn();
    tickBus.on('ownerEvent', handler);

    // affection is 100 now; already above threshold
    await applyVisitAffection(petId, OWNER_ID, 100); // → 105, no crossing

    tickBus.off('ownerEvent', handler);
    expect(handler).not.toHaveBeenCalled();
  });
});
