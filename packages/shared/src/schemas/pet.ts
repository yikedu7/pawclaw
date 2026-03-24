import { z } from 'zod';

// Pets
export const PetCreateSchema = z.object({
  soul_prompt: z.string().min(1),
  name: z.string().min(1).max(64),
  tint_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'tint_color must be a hex color like #rrggbb')
    .default('#ffffff'),
});

export const PetIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const PetEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ChatMessageSchema = z.object({
  message: z.string().min(1),
});

export const SocialEventTypeSchema = z.enum(['visit', 'gift', 'chat']);
