import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pets } from '../db/schema.js';
import { tickBus } from '../runtime/tick-bus.js';

const AFFECTION_PER_VISIT = 5;
const FRIEND_THRESHOLD = 100;

/**
 * Increments affection for a pet after a visit.
 * Emits friend.unlocked if the threshold is newly crossed.
 */
export async function applyVisitAffection(
  petId: string,
  ownerId: string,
  currentAffection: number,
): Promise<void> {
  const newAffection = currentAffection + AFFECTION_PER_VISIT;
  await db.update(pets).set({ affection: newAffection }).where(eq(pets.id, petId));

  if (currentAffection < FRIEND_THRESHOLD && newAffection >= FRIEND_THRESHOLD) {
    tickBus.emit('ownerEvent', ownerId, {
      type: 'friend.unlocked',
      data: { pet_id: petId, owner_id: ownerId },
    });
  }
}
