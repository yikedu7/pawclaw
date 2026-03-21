# Container Design — Per-Pet Runtime

Answers the five design questions raised in issue #44.
Written after reviewing: architecture.md, risks.md, mvp-spec.md, issue #37, issue #38, PR #40, and Railway pricing.

---

## Critical context from PR #40

PR #40 (OpenClaw research) changed the ground truth for this document:

- `openclaw:latest` on Docker Hub **does not exist** (404). The official image is `ghcr.io/openclaw/openclaw:latest`.
- OpenClaw is a **personal AI assistant gateway** (single-user, Telegram/Discord routing) — not a per-pet container runtime. It has no event API for an external backend to consume; all output routes through its own messaging channels.
- OpenClaw's gateway port 18789 exposes a control UI and health checks, not a programmable webhook receiver.
- SKILL.md tools use built-in exec/browser tools; they do **not** call external HTTP endpoints.

This means Route D (Docker per pet) as originally designed does not work with the actual OpenClaw image. This document designs around that reality and recommends a path forward.

---

## Question 1: Railway vs Hetzner for container hosting

### Railway capabilities

- Custom Dockerfiles supported on all paid plans.
- Resource billing: $0.00000772/vCPU-sec + $0.00000386/GB-sec — no per-service flat fee.
- **Private networking** is available on Pro plan ($20/mo minimum) and above only. On Hobby plan, services cannot communicate on a private network.
- Railway does not document cold start behavior explicitly. Services that are always-on (no scale-to-zero configuration) remain running. Scale-to-zero is opt-in.
- 20 pets as 20 Railway services: each service needs its own Dockerfile build and deploy pipeline. There is no batch service API; management complexity scales linearly.

### Hetzner CX21 approach

- Flat $6/month for one CX21 (2 vCPU, 4 GB RAM, 40 GB SSD) — hosts up to 20 containers.
- Remote Docker access via TLS (TCP 2376) is fully documented in issue #38: CA cert + client cert/key stored as Railway env vars, `dockerode` connects with TLS config.
- Single point of failure: if the VPS goes down, all pets stop. For a hackathon demo with 2 pre-seeded pets, this is acceptable.
- Total cost: ~$6/month vs Railway Hobby $5/month base + resource charges per running container.

### Recommendation: Hetzner CX21 (Route D revised)

**Decision: Hetzner CX21 running self-implemented pet runtime containers.**

However, because OpenClaw cannot be used as-is (see PR #40), the container image must change:

- **Discard the `ghcr.io/openclaw/openclaw:latest` image.**
- Build a lightweight custom image (`x-pet-runtime:latest`) that implements the SOUL.md/SKILL.md contract directly: reads personality files, calls Claude via Anthropic SDK, exposes an HTTP webhook receiver, and POSTs events back to the backend.
- This is equivalent to Route C (self-implemented runtime) but retains per-pet container isolation from Route D.

Rationale:
- Hetzner is $6/month flat vs Railway Pro required for private networking between 20 services.
- Container isolation per pet is preserved (satisfies the product requirement documented in risks.md R4).
- The custom image is simpler than OpenClaw: no Telegram/Discord gateway, no built-in browser, no GHCR authentication.
- Railway backend continues to run on Railway (unchanged). Only the pet runtime containers move to Hetzner.

**If Hetzner VPS fails at demo time:** activate Route B — pre-provision 2 demo pets as Railway services using the same custom image, with hardcoded ports, before the demo. This is the fallback documented in architecture.md.

---

## Question 2: Port mapping strategy

OpenClaw's gateway port is 18789. The custom runtime image will use the same port internally for consistency.

### Allocation scheme: static range with DB tracking

Assign host ports from a fixed range: **19000–19999** (1,000 slots, far more than the 20-pet MVP target).

Formula:
```
host_port = 19000 + (allocation_index % 1000)
```

`allocation_index` is a monotonically incrementing integer stored in a `port_allocations` table (or derived from a sequence). It never reuses a port slot until the previous container using that slot is confirmed deleted.

**Why static range over dynamic allocation:**
- No race condition: two concurrent pet creations cannot claim the same port.
- Simple to firewall: open 19000–19999 on Hetzner, nothing else.
- Easy to debug: `host_port` in the DB immediately tells you which container to `docker logs`.
- Dynamic allocation (bind to port 0, inspect result) requires an extra Docker inspect API call and is harder to reproduce.

### DB tracking

Add to the `pets` table (see DB schema section below):

```
container_id    text        -- Docker container ID (short hash)
container_host  text        -- Hetzner host IP or hostname
container_port  integer     -- host port mapped to runtime port 18789
container_status text       -- created | starting | running | stopped | deleted
```

Backend resolves the runtime URL as: `http://{container_host}:{container_port}`

---

## Question 3: Secret injection per container

### ANTHROPIC_API_KEY

**Shared across all containers.** There is one Anthropic account and one API key for the project. Splitting it per pet provides no security benefit (all containers belong to the same operator) and adds operational overhead. The key is injected as an env var at container creation time, sourced from the Railway backend's own `ANTHROPIC_API_KEY` env var.

### OPENCLAW_GATEWAY_TOKEN (or equivalent: PET_GATEWAY_TOKEN)

**Generated uniquely per pet at creation time.** This token secures the per-pet HTTP webhook endpoint so only the backend (which knows the token) can trigger ticks on a given container.

Generation: `crypto.randomUUID()` at `POST /api/pets` time, stored in the `pets` table as `gateway_token`. Injected into the container at creation. Never exposed via any frontend API.

### Full env var set injected at container creation

| Variable | Value | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | shared from Railway env | LLM calls |
| `PET_GATEWAY_TOKEN` | `crypto.randomUUID()` per pet | Authenticates tick webhook caller |
| `PET_ID` | pet UUID | Identifies this container's pet |
| `BACKEND_CALLBACK_URL` | `https://<railway-backend>/internal/runtime/events/{petId}` | Where container POSTs events back |
| `HOME` | `/home/node` | Required by Node.js base image |
| `NODE_ENV` | `production` | |

No other secrets are needed for the MVP runtime. On-chain wallet operations (X402, Onchain OS) remain in the Railway backend process, not the container — the container handles only LLM reasoning and event emission.

---

## Question 4: Lifecycle state machine

```
        POST /api/pets
             |
             v
         [created]
      (DB row inserted,
       SOUL.md/SKILL.md written
       to /data/pets/{uuid}/ on host)
             |
             | docker.createContainer() + docker.start()
             v
         [starting]
      (container exists, waiting
       for /healthz to return 200)
             |
             | /healthz returns 200
             v
         [running]  <---------+
      (tick loop active,       |
       events flowing)         |
             |                 |
             | container crash | docker restart policy: on-failure, max 3
             +------[restarting]---+
             |
             | DELETE /api/pets/:id
             | or admin stop
             v
         [stopping]
      (docker.stop() called,
       graceful shutdown 10s timeout)
             |
             v
         [stopped]
      (container exited,
       bind mount /data/pets/{uuid}/ retained)
             |
             | docker.remove()
             v
         [deleted]
      (container gone, bind mount
       optionally archived or purged)
```

### Spawn policy: eager at pet creation

Containers are spawned immediately on `POST /api/pets`, not lazily. The MVP has at most 20 pets; there is no reason to defer. The frontend shows a "starting..." state while `container_status = starting`.

### Stop policy: explicit delete only (MVP)

For the hackathon MVP, containers run continuously. No inactivity timeout. Stopping happens only on `DELETE /api/pets/:id` or manual operator action. This simplifies the state machine and avoids demo interruption.

Post-MVP: add an inactivity timeout (e.g., stop container after 24h of no tick triggers) to reduce Hetzner resource usage.

### Conversation state on crash

The bind mount at `/data/pets/{uuid}/` on the Hetzner host persists across container restarts. The container's working directory (SOUL.md, SKILL.md, and any runtime-managed memory files under `.runtime/`) survives crashes. Conversation history stored in the PostgreSQL `pets.llm_history` jsonb column is written by the backend after each tick callback — no history is lost unless the backend call itself fails before writing.

Restart policy: `on-failure` with `MaximumRetryCount: 3`. After 3 failures, `container_status` is set to `stopped` and a log entry is written. The backend alerts via structured log; no automated recovery beyond the 3 retries.

---

## Question 5: Tick loop to runtime HTTP contract

### Architecture note

Because OpenClaw does not support external webhook callbacks (confirmed in PR #40), the runtime container is a **custom Node.js service** (`x-pet-runtime`) that implements:
1. An HTTP server receiving tick triggers from the backend.
2. LLM calls (Claude via Anthropic SDK) using the pet's SOUL.md as system prompt.
3. Event POSTs back to the Railway backend on each action taken.

The backend's existing tick loop (in `packages/backend/src/runtime/`) drives the schedule; the container executes the LLM reasoning and returns structured events.

---

### Direction 1: Backend → Container (tick trigger)

**Endpoint:** `POST http://{container_host}:{container_port}/webhook/{petId}`

**Authentication:** `Authorization: Bearer {PET_GATEWAY_TOKEN}` header. The container validates this token against the `PET_GATEWAY_TOKEN` env var. Requests without a valid token return 401.

**Request body:**
```json
{
  "pet_id": "550e8400-e29b-41d4-a716-446655440000",
  "tick_at": "2026-03-21T10:00:00.000Z",
  "state": {
    "hunger": 62,
    "mood": 45,
    "affection": 12
  },
  "context": {
    "nearby_pets": [
      { "id": "...", "name": "Mochi", "soul_summary": "a cheerful golden retriever" }
    ],
    "recent_events": [
      { "type": "visit", "from": "Mochi", "at": "2026-03-21T09:30:00.000Z" }
    ]
  }
}
```

**Field notes:**
- `state` provides current stat values so the container does not need DB access.
- `context.nearby_pets` gives the LLM enough to decide whether to visit and what to say.
- `context.recent_events` gives short-term memory for coherent personality.

**Successful response:** `200 OK` with body:
```json
{ "accepted": true }
```

The actual action events arrive asynchronously via the callback (Direction 2). The backend does not block on a tick result.

**Error responses:** `401` (bad token), `429` (tick already in progress for this pet — container rejects concurrent ticks), `503` (container not ready).

---

### Direction 2: Container → Backend (event callback)

**Endpoint:** `POST https://{railway-backend-host}/internal/runtime/events/{petId}`

The container knows this URL from the `BACKEND_CALLBACK_URL` env var injected at creation. No dynamic registration needed.

**Authentication:** same `PET_GATEWAY_TOKEN` in `Authorization: Bearer` header. The backend validates the token against the value stored in `pets.gateway_token`.

**Event body (one POST per action):**
```json
{
  "pet_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "speak | visit | gift | rest | state_update",
  "occurred_at": "2026-03-21T10:00:05.123Z",
  "payload": { }
}
```

**Payload shapes by event_type:**

`speak`:
```json
{ "message": "Today I feel strangely calm, like before a storm." }
```

`visit`:
```json
{
  "target_pet_id": "...",
  "dialogue": [
    { "speaker": "Biscuit", "line": "Hey Mochi, want to chase something?" },
    { "speaker": "Mochi",   "line": "Always! But maybe something slow today." }
  ]
}
```

`gift`:
```json
{
  "target_pet_id": "...",
  "token": "OKB",
  "amount": "0.001",
  "message": "A little bone for you."
}
```

`rest`:
```json
{ "duration_seconds": 30, "reason": "Hunger too low to socialize." }
```

`state_update`:
```json
{
  "hunger_delta": -5,
  "mood_delta": +8,
  "affection_delta": +2
}
```

**Backend handling of callbacks:**
1. Validate `Authorization` token against `pets.gateway_token`.
2. Write stat deltas to `pets` table.
3. For `gift` events: trigger X402 payment flow (stays in Railway backend, not container).
4. For `visit` events: insert `SocialEvent` row; check affection threshold for friend unlock.
5. Emit WebSocket event to owner's frontend via existing WS event bus.
6. Return `200 OK` with `{ "ok": true }`.

---

### How the container knows the callback URL

Injected as `BACKEND_CALLBACK_URL` env var at `docker.createContainer()` time:
```
BACKEND_CALLBACK_URL=https://x-pet-backend.railway.app/internal/runtime/events/550e8400-e29b-41d4-a716-446655440000
```

The pet UUID is embedded in the URL. The container does not need to discover or register it; it is baked in at creation and immutable for the container's lifetime.

---

## DB schema additions (pets table)

Add these columns to the existing `pets` table:

| Column | Type | Notes |
|---|---|---|
| `container_id` | `text` | Docker container ID (64-char hex). Null until container is created. |
| `container_host` | `text` | Hetzner host IP or hostname (e.g. `65.21.x.x`). Null until created. |
| `container_port` | `integer` | Host port mapped to runtime port (range 19000–19999). Null until created. |
| `container_status` | `text` | Enum: `created \| starting \| running \| stopping \| stopped \| deleted` |
| `gateway_token` | `text` | `crypto.randomUUID()` generated at pet creation. Never null after creation. |
| `port_index` | `integer` | Monotonic allocation index for port range. Unique, not reused while `container_status != deleted`. |

New separate table for port allocation tracking:

```sql
CREATE TABLE port_allocations (
  id          serial PRIMARY KEY,
  pet_id      uuid REFERENCES pets(id),
  host_port   integer NOT NULL UNIQUE,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  released_at  timestamptz           -- set when container_status = deleted
);
```

This makes port uniqueness enforced at the DB level, preventing double-allocation on concurrent pet creation requests.

---

## Issues that need updating based on these decisions

| Issue | Update needed |
|---|---|
| **#37** (OpenClaw research) | Mark as resolved (answered by PR #40). Note that the custom runtime image replaces OpenClaw. |
| **#38** (Hetzner/Docker TLS) | Proceed as specified. Add: open ports 19000–19999 inbound in Hetzner firewall rule. |
| **#44** (this issue) | Close when `docs/container-design.md` is merged. |
| **New issue needed** | "Build x-pet-runtime Docker image" — custom Node.js service implementing SOUL.md/SKILL.md execution, HTTP tick receiver on port 18789, event callback POSTs. This replaces the assumed `openclaw:latest` image everywhere. |
| **New issue needed** | "Implement container lifecycle manager in backend" (was #22/#39) — `dockerode` integration using the contract defined in this document. |
| **#12** (Pet CRUD API) | Update container creation step to use custom image and inject env vars per this document. |
| **#13** (LLM engine) | Update to clarify LLM execution happens inside the custom runtime container, not in the Railway backend process. |
| **architecture.md** | Update Route D section: replace `openclaw:latest` with `x-pet-runtime:latest`, add HTTP contract summary, update env var list. |
