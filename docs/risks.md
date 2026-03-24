# Risks & Open Unknowns

## Open (unresolved)

### R13: PLATFORM_WALLET_ADDRESS misconfiguration — MEDIUM
- **Risk:** `generateHeartbeatMd` throws at container creation time if `PLATFORM_WALLET_ADDRESS` is unset. Pets will be inserted into the DB but their containers will fail to start, silently leaving them in `container_status = 'starting'` forever.
- **Impact:** All pet creation succeeds at the API level (201 returned) but no pet actually runs. Symptoms: no WS events, all pets show hunger/mood at defaults.
- **Mitigation:** `generateHeartbeatMd` now throws rather than falling back to the zero address (which would silently route payments to the burn address). Added to startup validation checklist in `docs/deploy.md`.
- **Action needed:** Ensure `PLATFORM_WALLET_ADDRESS` is set in Railway env vars before first deploy (matches address derived from `BACKEND_RELAYER_PRIVATE_KEY`).

### R1: X402 LLM Endpoint — HIGH
- **Unknown:** Is there a native X402-supporting LLM endpoint in the XLayer ecosystem?
- **Impact:** Core demo mechanic (pet pays per LLM call via X402)
- **Action needed:** Query XLayer/OKX Discord, check hackathon docs
- **Fallback:** Implement X402 handshake as middleware wrapper around regular API calls. Functionally identical from demo perspective. Declare clearly: "pet wallet auto-pays via X402."

### R2: Onchain OS Swap API — HIGH
- **Unknown:** API documentation, authentication method, supported tokens on X Layer
- **Impact:** Gift mechanic (pet sends token to another pet's wallet)
- **Action needed:** Find OKX Onchain OS developer docs, request API access
- **Fallback:** Direct ethers.js ERC-20 transfer between pet wallets. Onchain OS wallet still used; swap skill stubbed.

### R3: Onchain OS Agent Wallet — MEDIUM
- **Unknown:** Exact API for creating a wallet tied to a pet identity, key management model
- **Impact:** Core identity feature (pet has its own wallet)
- **Action needed:** Read Onchain OS SDK docs
- **Fallback:** Generate HD wallet derivation from pet UUID using ethers.js, store encrypted private key in DB

### R12: OpenClaw Tick Delivery via External Port — RESOLVED ✅
- **Was:** `mock-tick.ts` used `fetch(http://<host>:<port>/webhook/<petId>)`. The OpenClaw gateway binds to `127.0.0.1:18789` — Docker port binding cannot forward to loopback-only services.
- **Fix:** Replaced with `deliverTick(containerId, petId, payload)` in `container.ts`. Uses `dockerode container.exec()` to run `curl` inside the container's network namespace, where `localhost:18789` is reachable. `mock-tick.ts` now checks `pet.container_id && pet.container_status === 'running' && HETZNER_HOST` before calling `deliverTick`.

### R9: docs-issue-sync LLM Write-Access — MEDIUM
- **Risk:** The `docs-issue-sync` workflow grants Claude Code Action write-access to **all** open issue bodies on every `docs/**` push. If the LLM misidentifies a contradiction, it silently rewrites an issue body with no human review step.
- **Blast radius:** All open issues could be rewritten in a single workflow run.
- **Mitigation:** Prompt explicitly constrains scope to concrete contradictions (wrong field names, resolved blockers) and instructs the LLM to do nothing if no issues are stale. Workflow permissions are scoped to `issues: write` only (no `contents: write`).
- **Monitoring:** Review `docs-issue-sync` run logs after every docs push; revert any incorrect edits via `gh issue edit`.

### R11: CORS `origin: true` — LOW
- **Risk:** Backend registered `@fastify/cors` with `origin: true` (allow all origins) for local smoke testing. In production on Railway, any origin can call the API.
- **Impact:** Low for MVP (no sensitive cross-origin state beyond JWT-gated routes), but violates least-privilege.
- **Action needed:** Before production deploy, restrict to the Railway frontend URL via `CORS_ORIGIN` env var: `origin: process.env.CORS_ORIGIN ?? true`.

### R10: Issue #12 Partial — Deferred Pet Lifecycle Scope — MEDIUM
- **What's deferred:** Real `wallet_address` from Onchain OS, `GET /api/pets/:id/events`, `DELETE /api/pets/:id`
- **Container provisioning:** Landed in PR #89 (merged). `POST /api/pets` now calls `createPetContainer` + `startContainer` when `HETZNER_HOST` is set.
- **Impact:** `wallet_address` returns empty string until Onchain OS integration lands. Events and delete endpoints not yet implemented.
- **Action needed:** Track remaining scope in separate issues.

**R6 — Frontend WsEvent schema alignment (FE2 prerequisite)**
- **Risk:** The frontend canvas (issue #10) subscribes to `eventBus` using the canonical `WsEvent` type from `@x-pet/shared`. The real WS client (issue FE2) must emit events using the same field names (`from_pet_id`, `to_pet_id`, `turns`, `token`, `amount`).
- **Impact:** Silent runtime breakage — `e.data.from_pet_id` returns `undefined` if the WS client sends `from` instead.
- **Mitigation:** `eventBus.ts` is typed against `@x-pet/shared#WsEvent`; TypeScript catches mismatches at compile time when the real WS client calls `eventBus.emit()`.

---

## Resolved

### R8: OpenClaw GHCR Image Authentication — RESOLVED ✅
- **Decision:** `ghcr.io/openclaw/openclaw:latest` is a public image — no `docker login` required.
- **Verified:** `docker pull` on an OrbStack Ubuntu 22.04 VM without any credentials succeeds (image size ~3.5GB). No GitHub PAT needed.


### R4: Runtime Architecture — RESOLVED ✅
- **Previously re-opened as critical blocker** based on incomplete research that concluded OpenClaw had no event output mechanism and no proactive mode.
- **Corrected research (issue #37, 2026-03-21) confirms both blockers are resolved:**
  1. **Event output (webhook egress) — CONFIRMED:** OpenClaw cron/heartbeat jobs with `delivery.mode: "webhook"` POST LLM results to an external backend URL. Auth via `cron.webhookToken` (bearer token). Our backend can receive OpenClaw output without polling.
  2. **Webhook ingress — CONFIRMED:** POST to `http://localhost:18789/webhook/<id>` triggers an LLM turn. The x-pet tick loop can drive OpenClaw turns via HTTP.
  3. **Proactive mode — CONFIRMED:** Heartbeat (periodic background LLM turns, configurable interval, reads `HEARTBEAT.md`) and full Cron job support are both implemented and working.
  4. **Image — CONFIRMED:** `ghcr.io/openclaw/openclaw:latest` (GHCR, not Docker Hub). Config dir `/home/node/.openclaw`, workspace `/home/node/.openclaw/workspace/`.
- **Route D is viable.** The tick loop integration pattern (ingress via `/webhook/<id>`, egress via `delivery.mode: webhook`) wires OpenClaw into the x-pet backend cleanly.
- **Remaining open risk:** R8 (GHCR auth on Hetzner host) — see above.

### R5: Frontend Framework — RESOLVED ✅
- **Decision:** PixiJS v8 for canvas layer, HTML/CSS for UI layer, WebSocket for real-time
- **Reason:** Thinner than Phaser, TypeScript-native, zero-friction agent state integration
- **Godot rejected:** WASM bundle too large, poor web embedding, JS↔WASM bridge overhead

### R6: Pet Discovery — RESOLVED ✅
- **Decision:** Random matching for MVP
- **Reason:** Reduces scope, still creates compelling social events
- **v2:** Personality embedding similarity (cosine distance on SOUL.md embeddings)

### R7: Docker Remote Access (Railway → Hetzner) — RESOLVED ✅
- **Decision:** SSH tunneling via `dockerode` SSH protocol. Backend connects using an ed25519 private key stored as a Railway env var (`HETZNER_SSH_KEY`). No port 2376 exposure required.
- **Rejected:** Docker TCP+TLS — Railway has no static egress IP (cannot allowlist port 2376), cert generation is error-prone under time pressure, `TLS handshake failed` errors are opaque.
- **Implementation:** See `docs/remote-docker-access.md` for full comparison and connection snippet. Issue #38 tracks VPS provisioning and keypair setup.
- **Remaining concern:** SSH private key leakage gives VPS shell access. Mitigated by storing key only in Railway env vars (not in repo) and using a dedicated deploy keypair.

### R14: `executeVisit` dialogue generation refactor — DEFERRED

- **Problem:** `visit.ts` currently owns both LLM call (pet B's response generation) and persistence/emit. This couples dialogue generation to the social layer and makes it hard to test or swap content.
- **Desired state:** Callers supply `turns: VisitTurn[]`; `executeVisit` only persists + emits. LLM generation moves to the tick layer.
- **Blocker:** All call sites (`visit_pet` tool in LLM tick, `openclawRoutes`) would need to generate dialogue before calling `executeVisit`. Not merged to main because non-mock callers would silently emit empty dialogue.
- **Reference:** PR #126 review; demo-hack already does this correctly for mock mode via `DEMO_TURNS` in `mock-tick.ts`.

---

## Monitoring

Update this file whenever:
- A new unknown is discovered during implementation
- A risk is resolved (move to Resolved section with decision)
- A fallback is activated (note which fallback and why)
