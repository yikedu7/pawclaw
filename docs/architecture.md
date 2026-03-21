# Architecture

## System Overview

x-pet is a multi-tenant AI pet runtime. Each pet is an autonomous agent with its own on-chain wallet, LLM-driven personality, and social behavior loop. The backend runs all pets in a single Node.js process; the frontend renders pet state via WebSocket events.

---

## Tech Stack (confirmed)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend runtime | Node.js 22 + TypeScript 5.8 | Single process, multi-tenant |
| HTTP + WebSocket | Fastify v5 + @fastify/websocket | One server for both |
| ORM | Drizzle ORM + postgres | Lightweight, TypeScript-native |
| Validation | Zod | API input + SOUL.md schema |
| Database | PostgreSQL via Supabase | Row-per-pet model |
| LLM | Claude claude-sonnet-4-6 | Tool-call quality |
| Payment | X402 protocol | M2M micropayments (see risks.md R1) |
| Chain | X Layer (zkEVM L2, OKB gas) | Low-cost micro-transactions |
| Agent wallet | OKX Onchain OS | Independent pet wallet (see risks.md R2/R3) |
| Frontend canvas | PixiJS v8 (WebGL) | TypeScript-native |
| Frontend UI | HTML + CSS over canvas | Stats, chat log, toasts |
| Real-time | WebSocket | Single event stream → canvas + DOM |
| Deployment | Railway | Backend + frontend as separate services |

---

## OpenClaw Runtime — Route Selection

OpenClaw is an AI agent runtime format the hackathon judges may require. It defines agent personality and capabilities via SOUL.md / SKILL.md files.

### Route A: Cloudflare moltworker ❌ Rejected

- Cold start 1-2 minutes — fatal for a pet social app
- Single-tenant design; multi-tenant PR abandoned
- ~$35/month per instance, unscalable
- 81 open issues; WebSocket stability questionable

### Route B: Hetzner VPS per pet (fallback only)

- One Hetzner CX11 (~$3.5/mo) per pet, full OpenClaw runtime
- **Note:** ClawHost has no REST API (dashboard UI only). Fallback uses Hetzner Cloud API directly.
- Cold start 5-10 min → mitigation: pre-provision all demo pets before demo
- 20 demo pets = $70/month

### Route C: Self-implemented Compatible Runtime ❌ Rejected

- Custom Node.js service following SOUL.md / SKILL.md format spec
- **Rejected:** Product requires per-pet process isolation; shared process does not satisfy this

### Route D: Docker per Pet on Hetzner VPS ✅ Selected

- 1x Hetzner CX21 ($6/mo) running Docker daemon; each pet = one `openclaw:latest` container
- Up to 20 demo pets on a single host; ~$15/month total
- Cold start 3-5s; full per-pet container isolation satisfies product requirement

**Container lifecycle (via `dockerode` SDK):**
```
POST /pets  → write SOUL.md/SKILL.md to /data/pets/{uuid}/ on host
            → docker.createContainer({ Image: 'openclaw:latest',
                HostConfig: { Binds: ['/data/pets/{uuid}:/home/openclaw'],
                              Memory: 512 * 1024 * 1024 } })
DELETE /pets/:id → container.stop() + container.remove()
```

**File storage (bind mount per pet):**
```
/data/pets/{pet_uuid}/
  ├── SOUL.md        ← written by backend at pet creation
  ├── SKILL.md       ← written by backend at pet creation
  └── .openclaw/     ← managed by OpenClaw (memory, history, etc.)
```

DB (`soul_md` column) is source of truth for API/UI; bind mount is OpenClaw's working directory. Host directory persists data across container restarts.

**Fallback:** If Docker image incompatibility or daemon access blocked, activate Route B (Hetzner API directly, pre-provision before demo). See `docs/risks.md` R4.

---

## Monorepo Structure

```
packages/
├── shared/
│   └── types/          ← shared TypeScript types, Zod schemas, DB types
├── backend/
│   ├── src/
│   │   ├── server.ts       ← Fastify entry point
│   │   ├── api/            ← REST route handlers
│   │   ├── ws/             ← WebSocket server + event emitter
│   │   ├── runtime/        ← pet tick loop + LLM execution engine
│   │   ├── social/         ← social event engine (visits, dialogue, affection)
│   │   ├── onchain/        ← Onchain OS wallet + X Layer integration
│   │   ├── payment/        ← X402 middleware
│   │   └── db/             ← Drizzle schema + client
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.ts         ← PixiJS app entry
│   │   ├── canvas/         ← PixiJS scenes, sprites, animations
│   │   ├── ws/             ← WebSocket client + event dispatch
│   │   └── ui/             ← DOM stats panel, chat log, toasts
│   └── package.json
└── contracts/              ← optional on-chain bits
```

---

## Data Model (core)

```typescript
// Pet — one row per pet
Pet {
  id: uuid
  owner_id: uuid
  name: string
  soul_md: text           // full SOUL.md content, used as LLM system prompt
  skill_md: text          // SKILL.md content, defines available tool calls
  wallet_address: string  // Onchain OS agent wallet
  hunger: number          // 0–100, decays over time
  mood: number            // 0–100
  affection: number       // social score, increments per positive event
  llm_history: jsonb      // conversation history for this pet
  last_tick_at: timestamp
}

// SocialEvent — one row per pet interaction
SocialEvent {
  id: uuid
  from_pet_id: uuid
  to_pet_id: uuid
  type: 'visit' | 'gift' | 'chat'
  payload: jsonb          // dialogue lines, gift details, tx hash
  created_at: timestamp
}

// Transaction — on-chain record
Transaction {
  id: uuid
  from_wallet: string
  to_wallet: string
  amount: string
  token: string
  tx_hash: string
  x_layer_confirmed: boolean
  created_at: timestamp
}
```

---

## Functional Modules & Estimates

| Module | Work | Est. | Risk |
|--------|------|------|------|
| Pet Profile DB | schema, wallet generation, encrypted storage | 0.5d | Low |
| SOUL.md Parser | frontmatter parsing → system prompt | 0.5d | Low |
| SKILL.md + Tool Router | parse skills, LLM tool call routing | 1d | Low |
| X402 Payment | per-pet wallet signing, 402 handshake | 1d | Medium (X402 endpoint TBC) |
| LLM Engine | conversation history, tool call handling | 0.5d | Low |
| OnchainOS Swap Skill | write SKILL.md + call OnchainOS API | 1d | High (API docs unknown) |
| Social Engine | dual-pet dialogue, affection, friend unlock | 1.5d | Medium |
| Telegram Bot | message routing, command handling | 0.5d | Low |
| **Total** | | **~6.5d** | |

---

## Pet Runtime Engine

```
tick loop (every N seconds per pet)
  → evaluate pet state (hunger, mood, affection)
  → decide action via LLM tool call (visit / rest / speak)
  → execute action (social event, stat update, payment)
  → emit WebSocket event to owner's frontend
  → write state to DB
```

LLM tool calls available to each pet (defined in SKILL.md):
- `visit_pet(target_pet_id)` → triggers social event engine
- `send_gift(target_pet_id, token, amount)` → triggers X402 + OnchainOS Swap
- `speak(message)` → emits chat line to frontend
- `rest()` → recovers hunger/mood

---

## Social Event Flow

```
Pet A tick → LLM decides: visit Pet B
  → load Pet B's SOUL.md
  → LLM generates Pet A line (using A's personality)
  → LLM generates Pet B response (using B's personality)
  → affection += delta for both pets
  → if gift: X402 payment fires (A wallet → B wallet)
  → SocialEvent row inserted
  → WebSocket events emitted to both owners
```

---

## X402 Payment Flow (target)

```
pet action triggers payment
  → POST /api/resource (no auth)
  → server returns 402 + payment details
  → pet wallet signs + submits tx to X Layer
  → server verifies tx → fulfills request
```

Fallback: middleware wraps regular API call, simulates 402 handshake, uses direct wallet transfer via ethers.js.

---

## WebSocket Event Schema

```typescript
// server → client
type WsEvent =
  | { type: 'pet.state'; data: Pick<Pet, 'hunger' | 'mood' | 'affection'> }
  | { type: 'pet.speak'; data: { pet_id: string; message: string } }
  | { type: 'social.visit'; data: { from: string; to: string; dialogue: string[] } }
  | { type: 'social.gift'; data: { from: string; to: string; tx_hash: string } }
  | { type: 'friend.unlocked'; data: { pet_id: string; owner_id: string } }
```

---

## Deployment (Railway)

- **backend service**: `packages/backend/` — Fastify HTTP + WebSocket on single port
- **frontend service**: `packages/frontend/` — static build
- **database**: Supabase PostgreSQL (external)
- **env vars**: managed in Railway dashboard, `.env.example` in repo root

Railway auto-detects Dockerfile in each package directory.
