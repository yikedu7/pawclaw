import { z } from 'zod';

export const PetCreateSchema = z.object({
  owner_id: z.string().uuid(),
  name: z.string().min(1).max(64),
  soul_md: z.string().min(1),
  skill_md: z.string().min(1),
});

export const PetIdParamSchema = z.object({
  id: z.string().uuid(),
});
