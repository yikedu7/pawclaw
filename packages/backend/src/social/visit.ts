import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pets, social_events } from '../db/schema.js';
import { tickBus } from '../runtime/tick-bus.js';
import { applyVisitAffection } from './affection.js';

const anthropic = new Anthropic();

/**
 * Executes a visit social event:
 * - Generates pet B's response line via Claude
 * - Inserts a social_event row with the full dialogue turns
 * - Emits social.visit to both owners via tickBus
 * - Applies affection to both pets
 */
export async function executeVisit(
  fromPetId: string,
  toPetId: string,
  greeting: string,
): Promise<void> {
  const [fromPet, toPet] = await Promise.all([
    db.query.pets.findFirst({ where: eq(pets.id, fromPetId) }),
    db.query.pets.findFirst({ where: eq(pets.id, toPetId) }),
  ]);
  if (!fromPet) throw new Error(`Pet not found: ${fromPetId}`);
  if (!toPet) throw new Error(`Pet not found: ${toPetId}`);

  // Pet B responds to the greeting
  const responseResp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 256,
    system: toPet.soul_md,
    messages: [
      {
        role: 'user',
        content: `${fromPet.name} visits you and says: "${greeting}"\nRespond with one short, in-character line as ${toPet.name}.`,
      },
    ],
  });
  const responseLine =
    responseResp.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '...';

  const turns = [
    { speaker_pet_id: fromPetId, line: greeting },
    { speaker_pet_id: toPetId, line: responseLine },
  ];

  // Persist the full dialogue
  await db.insert(social_events).values({
    from_pet_id: fromPetId,
    to_pet_id: toPetId,
    type: 'visit',
    payload: { turns },
  });

  // Emit to both owners
  const event = {
    type: 'social.visit' as const,
    data: { from_pet_id: fromPetId, to_pet_id: toPetId, turns },
  };
  tickBus.emit('ownerEvent', fromPet.owner_id, event);
  tickBus.emit('ownerEvent', toPet.owner_id, event);

  // Affection for both pets
  await Promise.all([
    applyVisitAffection(fromPetId, fromPet.owner_id, fromPet.affection),
    applyVisitAffection(toPetId, toPet.owner_id, toPet.affection),
  ]);
}
