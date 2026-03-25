import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { WsEvent } from '@x-pet/shared';
import { db } from '../db/client.js';
import { pets, transactions, social_events } from '../db/schema.js';
import { executeVisit } from '../social/visit.js';
import { send402, decodePaymentSignature, type PaymentAuthorization } from '../payment/x402.js';
import { verifyEIP3009Signature, submitTransferWithAuthorization } from '../payment/verify.js';

export type OpenclawRouteDeps = {
  emitOwnerEvent: (ownerId: string, event: WsEvent) => void;
  /** Override blockchain submission for testing. Defaults to real X Layer submission. */
  submitPaymentTx?: (authorization: PaymentAuthorization, signature: string) => Promise<string>;
  /** Override heartbeat payment submission for testing. Defaults to real X Layer submission. */
  submitHeartbeatTx?: (authorization: PaymentAuthorization, signature: string) => Promise<string>;
};

function checkBearerToken(authHeader: string | undefined): boolean {
  const token = process.env.OPENCLAW_WEBHOOK_TOKEN;
  if (!token) return false;
  return authHeader === `Bearer ${token}`;
}

const PetIdSchema = z.string().uuid();

const RuntimeEventSchema = z.discriminatedUnion('event_type', [
  z.object({ event_type: z.literal('speak'), message: z.string() }),
  z.object({ event_type: z.literal('visit'), target_pet_id: z.string().uuid(), greeting: z.string() }),
  z.object({ event_type: z.literal('gift'), target_pet_id: z.string().uuid(), amount: z.string(), tx_hash: z.string().optional() }),
  z.object({ event_type: z.literal('rest') }),
  z.object({
    event_type: z.literal('state_update'),
    hunger: z.number().int().min(0).max(100).optional(),
    mood: z.number().int().min(0).max(100).optional(),
  }),
]);

export async function registerOpenclawRoutes(
  fastify: FastifyInstance,
  deps: OpenclawRouteDeps,
) {
  // ── POST /internal/runtime/events/:petId ──────────────────────────────────
  // Receives lifecycle/action events from the OpenClaw container.
  // Auth: per-pet gateway_token (set by OpenClaw on container start).
  fastify.post('/internal/runtime/events/:petId', async (request, reply) => {
    const petIdParsed = PetIdSchema.safeParse((request.params as { petId: string }).petId);
    if (!petIdParsed.success) {
      return reply.code(400).send({ error: 'Invalid petId', code: 'VALIDATION_ERROR' });
    }
    const petId = petIdParsed.data;

    const bodyParsed = RuntimeEventSchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.code(400).send({ error: bodyParsed.error.message, code: 'VALIDATION_ERROR' });
    }

    const pet = await db.query.pets.findFirst({ where: eq(pets.id, petId) });
    if (!pet) return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });

    if (!pet.gateway_token || request.headers.authorization !== `Bearer ${pet.gateway_token}`) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const event = bodyParsed.data;

    switch (event.event_type) {
      case 'speak':
        deps.emitOwnerEvent(pet.owner_id, {
          type: 'pet.speak',
          data: { pet_id: petId, message: event.message },
        });
        break;

      case 'visit':
        await executeVisit(petId, event.target_pet_id, event.greeting);
        break;

      case 'gift': {
        // TODO(#16): X402 payment — call pet wallet via Onchain OS to send OKB on X Layer
        await db.insert(social_events).values({
          from_pet_id: petId,
          to_pet_id: event.target_pet_id,
          type: 'gift',
          payload: { amount: event.amount, token: 'OKB', tx_hash: event.tx_hash ?? '' },
        });
        const giftEventHeartbeat: WsEvent = {
          type: 'social.gift',
          data: { from_pet_id: petId, to_pet_id: event.target_pet_id, token: 'OKB', amount: event.amount, tx_hash: event.tx_hash ?? '' },
        };
        deps.emitOwnerEvent(pet.owner_id, giftEventHeartbeat);
        const receiverPetHeartbeat = await db.query.pets.findFirst({ where: eq(pets.id, event.target_pet_id) });
        if (receiverPetHeartbeat && receiverPetHeartbeat.owner_id !== pet.owner_id) {
          deps.emitOwnerEvent(receiverPetHeartbeat.owner_id, giftEventHeartbeat);
        }
        break;
      }

      case 'rest': {
        const newHunger = Math.min(100, pet.hunger + 10);
        const newMood = Math.min(100, pet.mood + 5);
        await db.update(pets).set({ hunger: newHunger, mood: newMood }).where(eq(pets.id, petId));
        deps.emitOwnerEvent(pet.owner_id, {
          type: 'pet.state',
          data: { pet_id: petId, hunger: newHunger, mood: newMood, affection: pet.affection },
        });
        break;
      }

      case 'state_update': {
        const updates: Partial<{ hunger: number; mood: number }> = {};
        if (event.hunger !== undefined) updates.hunger = event.hunger;
        if (event.mood !== undefined) updates.mood = event.mood;
        if (Object.keys(updates).length > 0) {
          await db.update(pets).set(updates).where(eq(pets.id, petId));
        }
        deps.emitOwnerEvent(pet.owner_id, {
          type: 'pet.state',
          data: {
            pet_id: petId,
            hunger: updates.hunger ?? pet.hunger,
            mood: updates.mood ?? pet.mood,
            affection: pet.affection,
          },
        });
        break;
      }
    }

    return reply.send({ ok: true });
  });

  // ── POST /internal/tools/visit_pet ────────────────────────────────────────
  fastify.post('/internal/tools/visit_pet', async (request, reply) => {
    if (!checkBearerToken(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const parsed = z.object({
      pet_id: z.string().uuid(),
      target_pet_id: z.string().uuid(),
      greeting: z.string(),
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
    }
    await executeVisit(parsed.data.pet_id, parsed.data.target_pet_id, parsed.data.greeting);
    return reply.send({ ok: true });
  });

  // ── POST /internal/tools/speak ────────────────────────────────────────────
  fastify.post('/internal/tools/speak', async (request, reply) => {
    if (!checkBearerToken(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const parsed = z.object({ pet_id: z.string().uuid(), message: z.string() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
    }
    const pet = await db.query.pets.findFirst({ where: eq(pets.id, parsed.data.pet_id) });
    if (!pet) return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    deps.emitOwnerEvent(pet.owner_id, {
      type: 'pet.speak',
      data: { pet_id: parsed.data.pet_id, message: parsed.data.message },
    });
    return reply.send({ ok: true });
  });

  // ── POST /internal/tools/rest ─────────────────────────────────────────────
  fastify.post('/internal/tools/rest', async (request, reply) => {
    if (!checkBearerToken(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const parsed = z.object({ pet_id: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
    }
    const pet = await db.query.pets.findFirst({ where: eq(pets.id, parsed.data.pet_id) });
    if (!pet) return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    const newHunger = Math.min(100, pet.hunger + 10);
    const newMood = Math.min(100, pet.mood + 5);
    await db.update(pets).set({ hunger: newHunger, mood: newMood }).where(eq(pets.id, parsed.data.pet_id));
    deps.emitOwnerEvent(pet.owner_id, {
      type: 'pet.state',
      data: { pet_id: parsed.data.pet_id, hunger: newHunger, mood: newMood, affection: pet.affection },
    });
    return reply.send({ ok: true });
  });

  // ── POST /internal/tools/send_gift ────────────────────────────────────────
  // x402 payment flow:
  //   First call  (no PAYMENT-SIGNATURE)  → HTTP 402 with base64-encoded requirements
  //   Replay call (PAYMENT-SIGNATURE set) → verify EIP-3009 sig, submit tx, record, emit WS
  fastify.post('/internal/tools/send_gift', async (request, reply) => {
    if (!checkBearerToken(request.headers.authorization)) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
    const parsed = z.object({
      pet_id: z.string().uuid(),
      target_pet_id: z.string().uuid(),
      amount: z.string(),
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message, code: 'VALIDATION_ERROR' });
    }
    const { pet_id, target_pet_id, amount } = parsed.data;

    const [pet, targetPet] = await Promise.all([
      db.query.pets.findFirst({ where: eq(pets.id, pet_id) }),
      db.query.pets.findFirst({ where: eq(pets.id, target_pet_id) }),
    ]);
    if (!pet) return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });
    if (!targetPet) return reply.code(404).send({ error: 'Target pet not found', code: 'NOT_FOUND' });

    const paymentHeader = request.headers['payment-signature'] as string | undefined;

    // ── First call: no payment header → return 402 requirements ──────────────
    if (!paymentHeader) {
      if (!targetPet.wallet_address) {
        return reply.code(422).send({ error: 'Target pet has no wallet address', code: 'NO_WALLET' });
      }
      return send402(reply, amount, targetPet.wallet_address);
    }

    // ── Replay: decode, verify, submit ────────────────────────────────────────
    let payload: ReturnType<typeof decodePaymentSignature>;
    try {
      payload = decodePaymentSignature(paymentHeader);
    } catch {
      return reply.code(400).send({ error: 'Invalid PAYMENT-SIGNATURE header', code: 'VALIDATION_ERROR' });
    }

    const tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS;
    const tokenName = process.env.PAYMENT_TOKEN_NAME ?? 'OKB';
    if (!tokenAddress) {
      return reply.code(500).send({ error: 'PAYMENT_TOKEN_ADDRESS not configured', code: 'CONFIG_ERROR' });
    }

    let signerAddress: string;
    try {
      signerAddress = verifyEIP3009Signature(payload.authorization, payload.signature, tokenAddress, tokenName);
    } catch {
      return reply.code(401).send({ error: 'Invalid EIP-3009 signature', code: 'INVALID_SIGNATURE' });
    }

    if (signerAddress.toLowerCase() !== pet.wallet_address?.toLowerCase()) {
      return reply.code(401).send({ error: 'Signature does not match pet wallet', code: 'INVALID_SIGNATURE' });
    }

    let txHash: string;
    try {
      const doSubmit = deps.submitPaymentTx
        ?? ((auth, sig) => submitTransferWithAuthorization(auth, sig, tokenAddress));
      txHash = await doSubmit(payload.authorization, payload.signature);
    } catch (err) {
      return reply.code(502).send({ error: 'Payment submission failed', code: 'PAYMENT_FAILED' });
    }

    const token = process.env.PAYMENT_TOKEN_SYMBOL ?? tokenName;
    await db.insert(transactions).values({
      from_wallet: payload.authorization.from,
      to_wallet: payload.authorization.to,
      amount,
      token,
      tx_hash: txHash,
      x_layer_confirmed: true,
    });

    const giftEventSendGift: WsEvent = {
      type: 'social.gift',
      data: { from_pet_id: pet_id, to_pet_id: target_pet_id, token, amount, tx_hash: txHash },
    };
    deps.emitOwnerEvent(pet.owner_id, giftEventSendGift);
    if (targetPet.owner_id !== pet.owner_id) {
      deps.emitOwnerEvent(targetPet.owner_id, giftEventSendGift);
    }

    return reply.send({ ok: true, tx_hash: txHash });
  });

  // ── POST /internal/heartbeat/:petId ───────────────────────────────────────
  // X402 heartbeat payment endpoint called directly by the pet container.
  // Auth: per-pet gateway_token (same pattern as /internal/runtime/events/:petId).
  //
  // Flow:
  //   First call  (no PAYMENT-SIGNATURE header) → HTTP 402 with base64-encoded requirements
  //   Replay call (PAYMENT-SIGNATURE set)        → verify EIP-3009 sig, submit tx, record, deduct
  fastify.post('/internal/heartbeat/:petId', async (request, reply) => {
    const petIdParsed = PetIdSchema.safeParse((request.params as { petId: string }).petId);
    if (!petIdParsed.success) {
      return reply.code(400).send({ error: 'Invalid petId', code: 'VALIDATION_ERROR' });
    }
    const petId = petIdParsed.data;

    const pet = await db.query.pets.findFirst({ where: eq(pets.id, petId) });
    if (!pet) return reply.code(404).send({ error: 'Pet not found', code: 'NOT_FOUND' });

    if (!pet.gateway_token || request.headers.authorization !== `Bearer ${pet.gateway_token}`) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const paymentHeader = request.headers['payment-signature'] as string | undefined;

    // ── First call: no payment header → return 402 requirements ──────────────
    if (!paymentHeader) {
      const platformWallet = process.env.PLATFORM_WALLET_ADDRESS;
      if (!platformWallet) {
        return reply.code(500).send({ error: 'PLATFORM_WALLET_ADDRESS not configured', code: 'CONFIG_ERROR' });
      }
      return send402(reply, '0.000001', platformWallet);
    }

    // ── Replay: decode, verify, submit ────────────────────────────────────────
    let payload: ReturnType<typeof decodePaymentSignature>;
    try {
      payload = decodePaymentSignature(paymentHeader);
    } catch {
      return reply.code(400).send({ error: 'Invalid PAYMENT-SIGNATURE header', code: 'VALIDATION_ERROR' });
    }

    const tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS;
    const tokenName = process.env.PAYMENT_TOKEN_NAME ?? 'PAW';
    const tokenVersion = process.env.PAYMENT_TOKEN_VERSION ?? '1';
    if (!tokenAddress) {
      return reply.code(500).send({ error: 'PAYMENT_TOKEN_ADDRESS not configured', code: 'CONFIG_ERROR' });
    }

    let signerAddress: string;
    try {
      signerAddress = verifyEIP3009Signature(payload.authorization, payload.signature, tokenAddress, tokenName, tokenVersion);
    } catch {
      return reply.code(401).send({ error: 'Invalid EIP-3009 signature', code: 'INVALID_SIGNATURE' });
    }

    if (signerAddress.toLowerCase() !== pet.wallet_address?.toLowerCase()) {
      return reply.code(401).send({ error: 'Signature does not match pet wallet', code: 'INVALID_SIGNATURE' });
    }

    const platformWallet = process.env.PLATFORM_WALLET_ADDRESS;
    if (!platformWallet || payload.authorization.to.toLowerCase() !== platformWallet.toLowerCase()) {
      return reply.code(401).send({ error: 'Payment destination does not match platform wallet', code: 'INVALID_DESTINATION' });
    }

    let txHash: string;
    try {
      const doSubmit = deps.submitHeartbeatTx
        ?? ((auth, sig) => submitTransferWithAuthorization(auth, sig, tokenAddress));
      txHash = await doSubmit(payload.authorization, payload.signature);
    } catch {
      return reply.code(502).send({ error: 'Payment submission failed', code: 'PAYMENT_FAILED' });
    }

    const token = process.env.PAYMENT_TOKEN_SYMBOL ?? tokenName;
    await db.insert(transactions).values({
      from_wallet: payload.authorization.from,
      to_wallet: payload.authorization.to,
      amount: payload.authorization.value,
      token,
      tx_hash: txHash,
      x_layer_confirmed: true,
    });

    const decimals = parseInt(process.env.PAYMENT_TOKEN_DECIMALS ?? '18', 10);
    const deductAmount = Number(payload.authorization.value) / Math.pow(10, decimals);
    const newBalance = parseFloat(pet.paw_balance ?? '0') - deductAmount;

    await db.update(pets).set({ paw_balance: newBalance.toString() }).where(eq(pets.id, petId));

    return reply.send({ ok: true, tx_hash: txHash });
  });
}
