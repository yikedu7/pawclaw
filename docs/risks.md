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

### R7: Docker Remote Access (Railway → Hetzner) — HIGH
- **Unknown:** How does the Railway-hosted backend connect to the Docker daemon on a Hetzner VPS to manage per-pet containers?
- **Impact:** Entire Route D architecture depends on this. Options: (a) expose Docker daemon via TLS over the internet (security risk), (b) run an SSH tunnel from Railway to Hetzner (complex, fragile), (c) deploy a lightweight container management HTTP sidecar on Hetzner that Railway calls (extra service to build/maintain).
- **Action needed:** If Route D is kept, decide on remote Docker access strategy before implementing #22.
- **Fallback:** Switch to Route C (self-implemented runtime in the same Railway backend process), which eliminates remote Docker entirely.

### R8: OpenClaw GHCR Image Authentication — MEDIUM
- **Unknown:** Does `ghcr.io/openclaw/openclaw:latest` require authentication for `docker pull` on a Hetzner host? GitHub Container Registry allows public images to be pulled unauthenticated, but this must be verified for this specific package.
- **Impact:** If auth is required, the Hetzner host needs a GitHub PAT with `read:packages` scope configured on first boot — adds ops complexity.
- **Action needed:** Run `docker pull ghcr.io/openclaw/openclaw:latest` on a fresh host without `docker login`. If it fails, document the PAT setup step.
- **Fallback:** Use `1panel/openclaw` or `alpine/openclaw` from Docker Hub as a public mirror (both are community-maintained mirrors that sync from GHCR). Verify image integrity before demo.

---

## Resolved

### R4: Runtime Architecture — RE-OPENED AS CRITICAL BLOCKER ❌
- **Previously marked resolved** on assumption that `openclaw:latest` existed on Docker Hub and was a per-pet container runtime.
- **Research (issue #37, 2026-03-21) reveals both assumptions were wrong:**
  1. `openclaw:latest` does NOT exist on Docker Hub. The image is `ghcr.io/openclaw/openclaw:latest` (GHCR only).
  2. OpenClaw is a **personal AI assistant gateway** (single-user, connects to messaging channels). It is NOT a per-pet container runtime. There is no mechanism for an external backend to receive events from it — it routes all output to messaging channels it owns (Telegram/Discord/etc.).
- **Specific blockers:**
  - OpenClaw does not emit webhooks or file events that our backend can consume.
  - Its gateway HTTP port (18789) serves its own Control UI — not an agent event API.
  - SKILL.md tool calls execute via built-in tools (exec, browser) inside the OpenClaw sandbox, not by calling our HTTP endpoints.
  - Each container would need its own `ANTHROPIC_API_KEY`, gateway token, and channel tokens — no concept of "social graph" or "pet wallet" built in.
- **Recommended path:** Activate **Route C** — self-implemented Node.js runtime that reads SOUL.md/SKILL.md (same file format), calls Claude directly via Anthropic SDK, and emits events to our WebSocket bus. This is actually lower risk than Route D now: no Docker daemon on Hetzner required, no container networking complexity, no OpenClaw architecture mismatch.
- **Route C re-evaluation:** Original rejection reason ("product requires per-pet process isolation") can be satisfied by running one Node.js child process per pet via `child_process.fork()` or by keeping pets in the same process but namespacing all state by `pet_id`. For a hackathon demo, in-process isolation with strict `pet_id` scoping is sufficient.
- **Correct image reference (if Route D is still pursued):** `ghcr.io/openclaw/openclaw:latest` — bind mounts to `/home/node/.openclaw` (config) and `/home/node/.openclaw/workspace` (SOUL.md + skills). GHCR image requires authentication (`docker login ghcr.io`) on the Hetzner host.
- **Action needed:** Create issue to formally decide Route C vs Route D (revised), update #22 (container lifecycle manager) accordingly.

### R5: Frontend Framework — RESOLVED ✅
- **Decision:** PixiJS v8 for canvas layer, HTML/CSS for UI layer, WebSocket for real-time
- **Reason:** Thinner than Phaser, TypeScript-native, zero-friction agent state integration
- **Godot rejected:** WASM bundle too large, poor web embedding, JS↔WASM bridge overhead

### R6: Pet Discovery — RESOLVED ✅
- **Decision:** Random matching for MVP
- **Reason:** Reduces scope, still creates compelling social events
- **v2:** Personality embedding similarity (cosine distance on SOUL.md embeddings)

---

## Monitoring

Update this file whenever:
- A new unknown is discovered during implementation
- A risk is resolved (move to Resolved section with decision)
- A fallback is activated (note which fallback and why)
