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

**Research findings (issue #37, 2026-03-21, corrected 2026-03-21):**

OpenClaw (`github.com/openclaw/openclaw`) is a persistent AI agent gateway runtime. Confirmed facts:

1. **Image registry:** The official image is **`ghcr.io/openclaw/openclaw:latest`** (GitHub Container Registry, NOT Docker Hub). Common tags: `latest`, `main`, `<version>` (e.g. `2026.2.26`). Latest release: `v2026.3.13-1`.

2. **Data directory inside container:**
   - Config dir: `/home/node/.openclaw`
   - SOUL.md: `/home/node/.openclaw/workspace/SOUL.md`
   - Skills: `/home/node/.openclaw/workspace/skills/<skill-name>/SKILL.md`
   - Container runs as user `node` (uid 1000); host mount must be `chown -R 1000:1000`

3. **Required environment variables:**
   - `OPENCLAW_GATEWAY_TOKEN` — auth token for the HTTP gateway
   - `ANTHROPIC_API_KEY` — LLM provider key
   - `HOME=/home/node`
   - Optional channel tokens: `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN`

4. **HTTP gateway:** Port 18789. Exposes health endpoints (`/healthz`, `/readyz`) and a Web UI. Bridge port 18790 is also exposed (internal CLI communication).

5. **Proactive mode — CONFIRMED:**
   OpenClaw has two proactive execution mechanisms:
   - **Heartbeat** — periodic background LLM turns (configurable interval, default 30 min). Reads `HEARTBEAT.md` as a checklist. Suppresses `HEARTBEAT_OK` responses. Config keys: `agents.defaults.heartbeat.every`, `activeHours`, `isolatedSession`, `lightContext`.
   - **Cron jobs** — full cron expression support, one-shot, and interval. Two session types: `main` or `isolated`.

6. **Tick loop integration — CONFIRMED working patterns:**
   - **Tick → OpenClaw (webhook ingress):** POST to `http://localhost:18789/webhook/<id>` triggers an LLM turn. Configured via `webhooks` array in `openclaw.json`.
   - **OpenClaw → backend (webhook egress):** A cron or heartbeat job with `delivery.mode: "webhook"` POSTs LLM output back to the x-pet backend URL. Auth via `cron.webhookToken` (bearer token).

7. **SKILL.md tool call execution:**
   - SKILL.md is a markdown file with YAML frontmatter (`name`, `description`, `metadata`).
   - Skills are prompt-injection documents — they instruct the LLM how to use built-in tools (exec, browser, file I/O, etc.).
   - Tool calls execute within the OpenClaw sandbox container using built-in tools (`exec`, `browser`, `system.run`, etc.).
   - To call our backend, a skill uses `exec` to run a `curl` or `fetch` command.

**Container reference (via `dockerode` SDK, SSH transport):**
```
POST /pets  → write files to /data/pets/{uuid}/ on Hetzner host
            → docker.createContainer({
                Image: 'ghcr.io/openclaw/openclaw:latest',
                HostConfig: {
                  Binds: [
                    '/data/pets/{uuid}/config:/home/node/.openclaw',
                    '/data/pets/{uuid}/workspace:/home/node/.openclaw/workspace'
                  ],
                  PortBindings: { '18789/tcp': [{ HostPort: '<allocated>' }] },
                  Memory: 512 * 1024 * 1024,
                  RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 3 }
                },
                Env: [
                  'OPENCLAW_GATEWAY_TOKEN=<per-pet-token>',
                  'ANTHROPIC_API_KEY=<key>',
                  'HOME=/home/node'
                ]
              })
DELETE /pets/:id → container.stop() + container.remove()
```

**File layout inside container (confirmed):**
```
/home/node/.openclaw/              ← OPENCLAW_CONFIG_DIR bind mount
  ├── openclaw.json                ← OpenClaw config (model, heartbeat, webhooks, cron)
  └── workspace/                   ← OPENCLAW_WORKSPACE_DIR bind mount
      ├── SOUL.md                  ← pet identity/personality (written at creation)
      ├── HEARTBEAT.md             ← heartbeat checklist (proactive tick)
      └── skills/
          └── x-pet/
              └── SKILL.md         ← pet tool definitions (written at creation)
```

**Tick loop integration pattern:**
```
x-pet backend tick fires
  → POST http://<hetzner-host>:<pet-port>/webhook/<id>
  → OpenClaw LLM turn executes (reads SOUL.md, runs skills)
  → OpenClaw POSTs result to x-pet backend via webhook egress
    (delivery.mode: "webhook", auth: Bearer cron.webhookToken)
  → x-pet backend processes result → emits WebSocket event
```

**Remote Docker access:** Backend connects to Hetzner dockerd via SSH tunneling (`dockerode` SSH protocol, ed25519 key stored as Railway env var). Port 2376 is not exposed. See `docs/risks.md` R7 and issue #38.

**Port allocation:** Static range 19000–19999, tracked in `port_allocations` DB table. See `docs/container-design.md` for full scheme.

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
