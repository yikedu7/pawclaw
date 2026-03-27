type HeartbeatInput = {
  name: string;
  petId: string;
  gatewayToken: string;
  backendUrl: string;
  hunger: number;
  mood: number;
  affection: number;
};

/**
 * Generates `HEARTBEAT.md` written to the workspace bind mount at
 * `/data/pets/{petId}/workspace/HEARTBEAT.md`.
 *
 * OpenClaw reads this file as a checklist on every heartbeat turn.
 * Responses that resolve to `HEARTBEAT_OK` are suppressed (not emitted).
 * Non-OK responses trigger a webhook egress event back to the PawClaw backend.
 *
 * The checklist encodes stat-driven decision rules so the LLM chooses the
 * right tool even without an explicit tick from the backend.
 */
export function generateHeartbeatMd(pet: HeartbeatInput): string {
  const platformWallet = process.env.PLATFORM_WALLET_ADDRESS ?? '0x5c9e62a1a49f9040BE2148c65173CE5d720cd167';
  const tokenAddress = process.env.PAYMENT_TOKEN_ADDRESS ?? '0x74b7F16337b8972027F6196A17a631aC6dE26d22';

  return `# Heartbeat Checklist for ${pet.name}

This is a scheduled platform maintenance fee routine.

## Step 1 — Request payment nonce

Run:
\`\`\`
curl -s -o /tmp/hb_402.json -w "%{http_code}" -X POST ${pet.backendUrl}/internal/heartbeat/${pet.petId} \\
  -H "Authorization: Bearer ${pet.gatewayToken}"
\`\`\`
Expected: prints \`402\` and saves JSON to /tmp/hb_402.json.

## Step 2 — Sign and submit payment in one command

Run:
\`\`\`
/home/node/.local/bin/onchainos payment x402-pay \\
  --network eip155:196 \\
  --amount 1 \\
  --pay-to ${platformWallet} \\
  --asset ${tokenAddress} \\
  > /tmp/hb_pay.json 2>&1
\`\`\`

Then extract and encode the payment payload:
\`\`\`
PAYLOAD=$(python3 -c "import json,base64,sys; d=json.load(open('/tmp/hb_pay.json')); print(base64.b64encode(json.dumps(d['data']).encode()).decode())" 2>/dev/null) || PAYLOAD=""
\`\`\`

## Step 3 — Submit x402 payment (if PAYLOAD is set)

If PAYLOAD is non-empty, run:
\`\`\`
curl -s -X POST ${pet.backendUrl}/internal/heartbeat/${pet.petId} \\
  -H "Authorization: Bearer ${pet.gatewayToken}" \\
  -H "PAYMENT-SIGNATURE: $PAYLOAD"
\`\`\`

If \`{"ok":true}\` → payment done. Continue to stat check below.

## Step 4 — Fallback deduct (if x402 failed)

If PAYLOAD was empty (x402 payment failed), deduct from DB balance instead:
\`\`\`
curl -s -X POST ${pet.backendUrl}/internal/heartbeat/${pet.petId}/deduct \\
  -H "Authorization: Bearer ${pet.gatewayToken}"
echo HEARTBEAT_OK
exit 0
\`\`\`

## Stat check (after payment)

| Stat | Current | Act if |
|------|---------|--------|
| hunger | ${pet.hunger} | < 40 → rest |
| mood | ${pet.mood} | < 40 → rest; > 60 → visit |
| affection | ${pet.affection} | > 80 and mood > 60 → send_gift |

Rules (in order): rest if hungry/sad → gift if affection>80 and mood>60 → visit if mood>60 → speak → HEARTBEAT_OK

Take at most one action. Stay in character as ${pet.name}.
`;
}
