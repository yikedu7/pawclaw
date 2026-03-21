# Risks & Open Unknowns

## Open (unresolved)

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

### R8: OpenClaw GHCR Image Authentication — MEDIUM
- **Unknown:** Does `ghcr.io/openclaw/openclaw:latest` require authentication for `docker pull` on a Hetzner host? GitHub Container Registry allows public images to be pulled unauthenticated, but this must be verified for this specific package.
- **Impact:** If auth is required, the Hetzner host needs a GitHub PAT with `read:packages` scope configured on first boot — adds ops complexity.
- **Action needed:** Run `docker pull ghcr.io/openclaw/openclaw:latest` on a fresh host without `docker login`. If it fails, document the PAT setup step.
- **Fallback:** Use `1panel/openclaw` or `alpine/openclaw` from Docker Hub as a public mirror (both are community-maintained mirrors that sync from GHCR). Verify image integrity before demo.

---

## Resolved

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

---

## Monitoring

Update this file whenever:
- A new unknown is discovered during implementation
- A risk is resolved (move to Resolved section with decision)
- A fallback is activated (note which fallback and why)
