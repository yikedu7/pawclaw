import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pets } from '../db/schema.js';

/**
 * Grants initial PAW credits to a pet by writing directly to the DB.
 * Sets paw_balance = initial_credits without any on-chain transaction.
 *
 * Called once at pet registration. Switch back to on-chain ERC20 transfer
 * when PAW token is live on X Layer.
 */
export async function grantDbCredits(petId: string): Promise<void> {
  await db
    .update(pets)
    .set({ paw_balance: sql`initial_credits::numeric` })
    .where(eq(pets.id, petId));
}
