import { z } from 'zod';

export const WsEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pet.state'),
    data: z.object({
      pet_id: z.string(),
      hunger: z.number(),
      mood: z.number(),
      affection: z.number(),
    }),
  }),
  z.object({
    type: z.literal('pet.speak'),
    data: z.object({
      pet_id: z.string(),
      message: z.string(),
    }),
  }),
  z.object({
    type: z.literal('social.visit'),
    data: z.object({
      from_pet_id: z.string(),
      to_pet_id: z.string(),
      turns: z.array(z.object({ speaker_pet_id: z.string(), line: z.string() })),
    }),
  }),
  z.object({
    type: z.literal('social.gift'),
    data: z.object({
      from_pet_id: z.string(),
      to_pet_id: z.string(),
      token: z.string(),
      amount: z.string(),
      tx_hash: z.string(),
    }),
  }),
  z.object({
    type: z.literal('friend.unlocked'),
    data: z.object({
      pet_id: z.string(),
      owner_id: z.string(),
      pet_name: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('error'),
    data: z.object({
      pet_id: z.string(),
      message: z.string(),
    }),
  }),
]);

export const WsQuerySchema = z.object({ token: z.string() });
