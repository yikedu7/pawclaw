import { z } from 'zod';

// Auth
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Pets
export const PetCreateSchema = z.object({
  soul_prompt: z.string().min(1),
  name: z.string().min(1).max(64),
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
