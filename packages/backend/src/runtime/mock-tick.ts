import Anthropic from '@anthropic-ai/sdk';
import { eq, desc, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { pets, social_events } from '../db/schema.js';
import { tickBus } from './tick-bus.js';
import { tickTools } from './tick-tools.js';
import { executeVisit } from '../social/visit.js';
import { deliverTick } from './container.js';

const anthropic = new Anthropic();

// Demo cycle counter — rotates through all action types for frontend testing
let demoCycle = 0;
const DEMO_ACTIONS = ['speak', 'rest', 'visit', 'gift'] as const;

// Zod schemas for LLM tool inputs
const VisitPetInput = z.object({
  target_pet_id: z.string().uuid(),
  greeting: z.string(),
});

const SpeakInput = z.object({
  message: z.string(),
});

const SendGiftInput = z.object({
  target_pet_id: z.string().uuid(),
  amount: z.string(),
});

export async function executeTick(petId: string): Promise<{ action: string }> {
  // 1. Fetch pet from DB
  const pet = await db.query.pets.findFirst({
    where: eq(pets.id, petId),
  });
  if (!pet) throw new Error(`Pet not found: ${petId}`);

  // Demo cycle mode — skip LLM, rotate through all action types for frontend testing
  if (process.env.MOCK_LLM === '1') {
    const action = DEMO_ACTIONS[demoCycle % DEMO_ACTIONS.length];
    demoCycle++;

    // Find another pet for visit/gift actions
    const otherPet = await db.query.pets.findFirst({ where: ne(pets.id, petId) });
    const targetId = otherPet?.id ?? petId; // fall back to self if no other pet

    switch (action) {
      case 'speak':
        tickBus.emit('ownerEvent', pet.owner_id, {
          type: 'pet.speak',
          data: { pet_id: petId, message: `Hi! I'm ${pet.name}. (demo tick ${demoCycle})` },
        });
        break;

      case 'rest': {
        const newHunger = Math.min(100, pet.hunger + 10);
        const newMood = Math.min(100, pet.mood + 5);
        await db.update(pets).set({ hunger: newHunger, mood: newMood }).where(eq(pets.id, petId));
        tickBus.emit('ownerEvent', pet.owner_id, {
          type: 'pet.state',
          data: { pet_id: petId, hunger: newHunger, mood: newMood, affection: pet.affection },
        });
        break;
      }

      case 'visit':
        await db.insert(social_events).values({
          from_pet_id: petId,
          to_pet_id: targetId,
          type: 'visit',
          payload: { greeting: `Hey ${otherPet?.name ?? 'friend'}! (demo)` },
        });
        tickBus.emit('ownerEvent', pet.owner_id, {
          type: 'social.visit',
          data: {
            from_pet_id: petId,
            to_pet_id: targetId,
            turns: [{ speaker_pet_id: petId, line: `Hey ${otherPet?.name ?? 'friend'}! Nice to see you!` }],
          },
        });
        break;

      case 'gift': {
        const txHash = `0xdemo_${Date.now().toString(16)}`;
        await db.insert(social_events).values({
          from_pet_id: petId,
          to_pet_id: targetId,
          type: 'gift',
          payload: { amount: '0.001', token: 'OKB', tx_hash: txHash },
        });
        tickBus.emit('ownerEvent', pet.owner_id, {
          type: 'social.gift',
          data: { from_pet_id: petId, to_pet_id: targetId, token: 'OKB', amount: '0.001', tx_hash: txHash },
        });
        break;
      }
    }

    await db.update(pets).set({ last_tick_at: new Date() }).where(eq(pets.id, petId));
    return { action: `${action} (demo cycle ${demoCycle})` };
  }

  // 2. If a container is running for this pet, deliver the tick via exec.
  // Using container.exec() rather than HTTP POST because the OpenClaw gateway
  // binds to 127.0.0.1:18789 — Docker port mapping cannot forward to loopback.
  if (pet.container_id && pet.container_status === 'running' && process.env.HETZNER_HOST) {
    const [recentForContainer, nearbyPets] = await Promise.all([
      db.query.social_events.findMany({
        where: eq(social_events.from_pet_id, petId),
        orderBy: [desc(social_events.created_at)],
        limit: 5,
      }),
      db.query.pets.findMany({ where: ne(pets.id, petId) }),
    ]);
    const payload = {
      pet_id: petId,
      tick_at: new Date().toISOString(),
      state: { hunger: pet.hunger, mood: pet.mood, affection: pet.affection },
      context: {
        nearby_pets: nearbyPets.map((p) => ({
          id: p.id,
          name: p.name,
          soul_summary: p.soul_md.split('\n')[0] ?? '',
        })),
        recent_events: recentForContainer.map((e) => ({
          type: e.type,
          from: e.from_pet_id,
          at: e.created_at.toISOString(),
        })),
      },
    };
    await deliverTick(pet.container_id, petId, payload);
    await db.update(pets).set({ last_tick_at: new Date() }).where(eq(pets.id, petId));
    return { action: 'container' };
  }

  // 3. Fetch last 5 social events involving this pet
  const recentEvents = await db.query.social_events.findMany({
    where: eq(social_events.from_pet_id, petId),
    orderBy: [desc(social_events.created_at)],
    limit: 5,
  });

  // 3. Build user message with state summary
  const stateLines = [
    `Current state:`,
    `- Hunger: ${pet.hunger}/100`,
    `- Mood: ${pet.mood}/100`,
    `- Affection: ${pet.affection}`,
    `- Last tick: ${pet.last_tick_at?.toISOString() ?? 'never'}`,
    ``,
    `Recent events (newest first):`,
  ];
  if (recentEvents.length === 0) {
    stateLines.push('  (none yet)');
  } else {
    for (const ev of recentEvents) {
      stateLines.push(
        `  - [${ev.type}] to=${ev.to_pet_id ?? 'self'} payload=${JSON.stringify(ev.payload)} at=${ev.created_at.toISOString()}`,
      );
    }
  }
  stateLines.push('', 'Decide your next action. Pick one tool to call.');

  // 4. Call Claude API
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 1024,
    system: pet.soul_md,
    messages: [{ role: 'user', content: stateLines.join('\n') }],
    tools: tickTools,
  });

  // 5. Find the tool_use block
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUse) {
    // LLM didn't call a tool — treat as a speak with its text output
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    const message = textBlock?.text ?? '...';
    tickBus.emit('ownerEvent', pet.owner_id, {
      type: 'pet.speak',
      data: { pet_id: petId, message },
    });
    await db
      .update(pets)
      .set({ last_tick_at: new Date() })
      .where(eq(pets.id, petId));
    return { action: 'speak (fallback)' };
  }

  // 6. Execute side effects based on tool call
  switch (toolUse.name) {
    case 'visit_pet': {
      const { target_pet_id, greeting } = VisitPetInput.parse(toolUse.input);
      await executeVisit(petId, target_pet_id, greeting);
      break;
    }

    case 'speak': {
      const { message } = SpeakInput.parse(toolUse.input);
      tickBus.emit('ownerEvent', pet.owner_id, {
        type: 'pet.speak',
        data: { pet_id: petId, message },
      });
      break;
    }

    case 'send_gift': {
      const { target_pet_id, amount } = SendGiftInput.parse(toolUse.input);
      // TODO(#16): X402 payment — call pet wallet via Onchain OS to send OKB on X Layer,
      // then confirm tx on-chain before inserting the social_event.
      // Mock tx_hash — real on-chain integration is a separate issue
      const txHash = `0xmock_${Date.now().toString(16)}`;
      await db.insert(social_events).values({
        from_pet_id: petId,
        to_pet_id: target_pet_id,
        type: 'gift',
        payload: { amount, token: 'OKB', tx_hash: txHash },
      });
      tickBus.emit('ownerEvent', pet.owner_id, {
        type: 'social.gift',
        data: {
          from_pet_id: petId,
          to_pet_id: target_pet_id,
          token: 'OKB',
          amount,
          tx_hash: txHash,
        },
      });
      break;
    }

    case 'rest': {
      const newHunger = Math.min(100, pet.hunger + 10);
      const newMood = Math.min(100, pet.mood + 5);
      await db
        .update(pets)
        .set({ hunger: newHunger, mood: newMood })
        .where(eq(pets.id, petId));
      tickBus.emit('ownerEvent', pet.owner_id, {
        type: 'pet.state',
        data: {
          pet_id: petId,
          hunger: newHunger,
          mood: newMood,
          affection: pet.affection,
        },
      });
      break;
    }
  }

  // 7. Update last_tick_at
  await db
    .update(pets)
    .set({ last_tick_at: new Date() })
    .where(eq(pets.id, petId));

  return { action: toolUse.name };
}
