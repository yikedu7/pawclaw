import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { PetCreateSchema, SocialEventTypeSchema } from '../schemas/pet.js';

describe('PetCreateSchema', () => {
  it('parses a valid payload', () => {
    const result = PetCreateSchema.parse({ name: 'Mochi', soul_prompt: 'A lazy cat' });
    expect(result).toEqual({ name: 'Mochi', soul_prompt: 'A lazy cat' });
  });

  it('throws ZodError when name is missing', () => {
    expect(() => PetCreateSchema.parse({ soul_prompt: 'A lazy cat' })).toThrow(ZodError);
  });

  it('throws ZodError when soul_prompt is missing', () => {
    expect(() => PetCreateSchema.parse({ name: 'Mochi' })).toThrow(ZodError);
  });
});

describe('SocialEventTypeSchema', () => {
  it('accepts a valid member "visit"', () => {
    expect(SocialEventTypeSchema.parse('visit')).toBe('visit');
  });

  it('throws ZodError for invalid value "fly"', () => {
    expect(() => SocialEventTypeSchema.parse('fly')).toThrow(ZodError);
  });
});
