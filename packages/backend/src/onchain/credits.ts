import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pets } from '../db/schema.js';

/**
 * Grants initial credits to a pet by writing directly to the DB.
 * Sets system_credits=0.24 (=0.3×0.8, so hunger starts at 20),
 * onchain_balance=0, hunger=20.
 *
 * Called once at pet registration.
 */
export async function grantDbCredits(petId: string): Promise<void> {
  await db
    .update(pets)
    .set({ system_credits: '0.24', onchain_balance: '0', hunger: 20 })
    .where(eq(pets.id, petId));
}
