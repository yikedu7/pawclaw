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

---

## Resolved

### R4: Runtime Architecture — RESOLVED ✅
- **Decision:** Route C — custom multi-tenant OpenClaw-compatible Node.js runtime
- **Reason:** Fastest to build, no cold start, full control, natural multi-tenancy
- **Alternative on standby:** Route B (ClawHost + Hetzner) if judges require native OpenClaw binary

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
