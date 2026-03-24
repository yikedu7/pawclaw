import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pets } from '../db/schema.js';
import { getPawBalance } from '../onchain/balance.js';
import { stopContainer } from './container.js';
import { tickBus } from './tick-bus.js';

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Minimal structured logger interface (compatible with fastify.log). */
export type PollerLogger = {
  error(obj: object, msg: string): void;
};

/**
 * Polls PAW balance for all running pets, updates paw_balance in DB,
 * and detects death (paw_balance hits 0 → stop container, emit pet.died).
 */
export async function pollBalances(log: PollerLogger): Promise<void> {
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
          await stopContainer(pet.container_id).catch((err: unknown) => {
            log.error({ err, petId: pet.id, containerId: pet.container_id }, '[balance-poller] stopContainer failed');
          });
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
      log.error({ err, petId: pet.id }, '[balance-poller] Failed to poll balance for pet');
    }
  }
}

/**
 * Starts the balance polling loop. Runs once immediately, then every 1h.
 * Accepts a structured logger (fastify.log or compatible).
 */
export function startBalancePoller(log: PollerLogger): void {
  pollBalances(log).catch((err: unknown) => {
    log.error({ err }, '[balance-poller] Initial poll failed');
  });
  setInterval(() => {
    pollBalances(log).catch((err: unknown) => {
      log.error({ err }, '[balance-poller] Poll failed');
    });
  }, POLL_INTERVAL_MS);
}
