import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  OWNER_ID, OTHER_OWNER, makeToken, makePetId,
  seedPet, resetStore, buildApp,
} from './helpers.js';

describe('auth hook', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pets' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is invalid', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/pets',
      headers: { authorization: 'Bearer bad-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization header has wrong scheme', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/pets',
      headers: { authorization: `Basic ${makeToken(OWNER_ID)}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/pets', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => resetStore());

  it('returns 201 with valid input', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
      payload: { name: 'Mochi', soul_prompt: 'a curious cat' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('Mochi');
    expect(body.hunger).toBe(100);
    expect(body.mood).toBe(100);
    expect(body.affection).toBe(0);
    expect(typeof body.id).toBe('string');
  });

  it('does not include owner_id in response', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
      payload: { name: 'Mochi', soul_prompt: 'a curious cat' },
    });
    expect(res.json()).not.toHaveProperty('owner_id');
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
      payload: { soul_prompt: 'a curious cat' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when soul_prompt is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
      payload: { name: 'Mochi' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/pets', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => resetStore());

  it('returns empty array when owner has no pets', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/pets',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe('GET /api/pets/:id', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  beforeEach(() => resetStore());

  it('returns pet with owner_id for valid request', async () => {
    const petId = makePetId();
    seedPet({ id: petId, owner_id: OWNER_ID, name: 'Mochi', wallet_address: '0xabc', hunger: 80, mood: 70, affection: 5 });

    const res = await app.inject({
      method: 'GET', url: `/api/pets/${petId}`,
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(petId);
    expect(body.owner_id).toBe(OWNER_ID);
    expect(body.name).toBe('Mochi');
    expect(body.wallet_address).toBe('0xabc');
  });

  it('returns 404 for non-existent pet', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/pets/00000000-0000-4000-b000-999999999999',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('returns 404 when pet belongs to another owner', async () => {
    const petId = makePetId();
    seedPet({ id: petId, owner_id: OTHER_OWNER, name: 'NotMine' });

    const res = await app.inject({
      method: 'GET', url: `/api/pets/${petId}`,
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid uuid', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/pets/not-a-uuid',
      headers: { authorization: `Bearer ${makeToken(OWNER_ID)}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
