import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pets, social_events } from '../db/schema.js';
import { tickBus } from '../runtime/tick-bus.js';
import { applyVisitAffection } from './affection.js';

export interface VisitTurn {
  speaker_pet_id: string;
  line: string;
}

/**
 * Executes a visit social event:
 * - Persists a social_event row with the provided dialogue turns
 * - Emits social.visit to the visiting pet's owner via tickBus
 * - Applies affection to both pets
 */
export async function executeVisit(
  fromPetId: string,
  toPetId: string,
  turns: VisitTurn[],
): Promise<void> {
  const [fromPet, toPet] = await Promise.all([
    db.query.pets.findFirst({ where: eq(pets.id, fromPetId) }),
    db.query.pets.findFirst({ where: eq(pets.id, toPetId) }),
  ]);
  if (!fromPet) throw new Error(`Pet not found: ${fromPetId}`);
  if (!toPet) throw new Error(`Pet not found: ${toPetId}`);

  // Persist the full dialogue
  await db.insert(social_events).values({
    from_pet_id: fromPetId,
    to_pet_id: toPetId,
    type: 'visit',
    payload: { turns },
  });

  // Emit only to the visiting pet's owner (the one whose canvas shows the visit animation)
  tickBus.emit('ownerEvent', fromPet.owner_id, {
    type: 'social.visit' as const,
    data: { from_pet_id: fromPetId, to_pet_id: toPetId, turns },
  });

  // Affection for both pets
  await Promise.all([
    applyVisitAffection(fromPetId, fromPet.owner_id, fromPet.affection),
    applyVisitAffection(toPetId, toPet.owner_id, toPet.affection),
  ]);
}
