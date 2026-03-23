import type { FastifyReply } from 'fastify';

export type PaymentAuthorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string; // bytes32 hex
};

export type PaymentPayload = {
  authorization: PaymentAuthorization;
  signature: string; // hex EIP-712 signature
};

export type X402Response = {
  x402Version: number;
  accepts: Array<{
    network: string;
    amount: string;
    payTo: string;
    asset: string;
    maxTimeoutSeconds: number;
  }>;
};

export function buildX402Response(amount: string, payTo: string): X402Response {
  const asset = process.env.PAYMENT_TOKEN_ADDRESS;
  if (!asset) throw new Error('PAYMENT_TOKEN_ADDRESS not configured');
  return {
    x402Version: 2,
    accepts: [{ network: 'eip155:196', amount, payTo, asset, maxTimeoutSeconds: 300 }],
  };
}

export function send402(reply: FastifyReply, amount: string, payTo: string): void {
  const body = buildX402Response(amount, payTo);
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64');
  reply.code(402).send(encoded);
}

export function decodePaymentSignature(header: string): PaymentPayload {
  const json = Buffer.from(header, 'base64').toString('utf8');
  return JSON.parse(json) as PaymentPayload;
}
