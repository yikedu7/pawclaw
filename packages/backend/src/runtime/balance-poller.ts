import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pets } from '../db/schema.js';
import { getPawBalance } from '../onchain/balance.js';
import { stopContainer } from './container.js';
import { tickBus } from './tick-bus.js';

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Polls PAW balance for all running pets, updates paw_balance in DB,
 * and detects death (paw_balance hits 0 → stop container, emit pet.died).
 */
export async function pollBalances(): Promise<void> {
  const runningPets = await db
    .select()
    .from(pets)
    .where(eq(pets.container_status, 'running'));

  for (const pet of runningPets) {
    if (!pet.wallet_address) continue;

    try {
      const balanceStr = await getPawBalance(pet.wallet_address);
      const balance = parseFloat(balanceStr);

      await db
        .update(pets)
        .set({ paw_balance: balanceStr })
        .where(eq(pets.id, pet.id));

      if (balance <= 0) {
        // Pet is out of PAW — stop container and emit pet.died
        if (pet.container_id) {
          await stopContainer(pet.container_id).catch(() => {});
        }
        tickBus.emit('ownerEvent', pet.owner_id, {
          type: 'pet.died',
          data: { pet_id: pet.id },
        });
      } else {
        // Emit updated hunger derived from PAW balance
        const hunger = Math.max(0, Math.min(100, Math.round((balance / pet.initial_credits) * 100)));
        tickBus.emit('ownerEvent', pet.owner_id, {
          type: 'pet.state',
          data: {
            pet_id: pet.id,
            hunger,
            mood: pet.mood,
            affection: pet.affection,
          },
        });
      }
    } catch (err: unknown) {
      console.error(`[balance-poller] Failed to poll balance for pet ${pet.id}:`, err);
    }
  }
}

/**
 * Starts the balance polling loop. Runs once immediately, then every 1h.
 */
export function startBalancePoller(): void {
  pollBalances().catch((err: unknown) => {
    console.error('[balance-poller] Initial poll failed:', err);
  });
  setInterval(() => {
    pollBalances().catch((err: unknown) => {
      console.error('[balance-poller] Poll failed:', err);
    });
  }, POLL_INTERVAL_MS);
}
