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
 * Polls on-chain USDC balance for all running pets, overwrites onchain_balance in DB
 * (simple overwrite — always ground truth, no delta, no race condition),
 * and runs shared post-processing (hunger recompute, death check).
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
      const onchainBalance = parseFloat(balanceStr);
      const systemCredits = parseFloat(pet.system_credits ?? '0');
      const initialCredits = parseFloat(pet.initial_credits ?? '0.3');
      const total = systemCredits + onchainBalance;
      const hunger = Math.max(0, Math.min(100, Math.round((1 - total / initialCredits) * 100)));

      await db
        .update(pets)
        .set({ onchain_balance: balanceStr, hunger })
        .where(eq(pets.id, pet.id));

      if (total <= 0) {
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
