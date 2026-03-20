# Risks & Open Unknowns

## Open (unresolved)

### R1: X402 LLM Endpoint — RESOLVED ✅ (fallback activated)

**Research conducted:** 2026-03-20 via x402.org/ecosystem, awesome-x402, OKX/XLayer docs, BlockEden analysis.

**Findings:**

1. **X402 is real and production-ready.** Coinbase launched x402 in May 2025; V2 shipped Sep 2025 (co-founded with Cloudflare). 100M+ payments processed. Protocol is open-source at `github.com/coinbase/x402`.

2. **X402 LLM endpoints exist — but not on XLayer.** Active endpoints as of March 2026:
   - **GPU-Bridge** — 30-service GPU inference API (LLM, embeddings, image gen, STT/TTS); USDC on Base L2
   - **zeroreader** — 29 Cloudflare Workers AI models; USDC on Base; $0.001–$0.015/request
   - **AskClaude** — Pay-per-question Claude Haiku/Sonnet/Opus; USDC on Base
   - **BlockRun.AI** — ChatGPT + major LLMs via x402; Base
   - **Daydreams Router** — LLM inference for agents; multi-provider; Base
   - All production facilitators support: Base, Ethereum, Solana, Polygon, Avalanche, BNB Chain

3. **No X402 facilitator for XLayer exists.** OKX/XLayer acknowledge x402 (they have a minimal `web3.okx.com/explorer/x402` page) and OKX uses x402 internally for 0-gas USDT/USDC relay on XLayer — but there is no public XLayer x402 facilitator and no LLM endpoint denominated in OKB or accepting payment on XLayer.

**Decision:** Activate fallback. Pet LLM calls will use the regular Anthropic API key. A custom X402 middleware will simulate the 402 handshake in-process:
- `POST /llm` returns `402 Payment Required` with an x402-formatted `X-Payment` header challenge
- Pet wallet signs and replays; middleware validates signature and proceeds
- Demonstrates the full x402 flow to judges; XLayer is the chain for pet-to-pet social/gift transactions (where on-chain value transfer is real)

**If time permits (P2):** Wrap Anthropic Claude behind a lightweight x402-compatible proxy that accepts USDC on Base. This makes the LLM payment real but moves off XLayer. Not worth MVP complexity.

- **Impact:** Demo script unchanged — "pet wallet auto-pays for LLM inference via X402" holds. The handshake is real; the settlement is simulated. Judges see HTTP 402 flow in action.

### R2: Onchain OS Swap API — HIGH
- **Unknown:** API documentation quality, interface shape, authentication method, supported tokens on X Layer
- **Impact:** Gift mechanic — pet sends token to another pet's wallet
- **Action needed:** Obtain OKX Onchain OS developer docs ASAP, request API access
- **Fallback:** Direct ethers.js ERC-20 transfer between pet wallets. Onchain OS wallet still used; Swap skill stubbed.

### R3: Onchain OS Agent Wallet — MEDIUM
- **Unknown:** Exact API for creating a wallet tied to a pet identity, key management model
- **Impact:** Core identity feature — pet has its own independent wallet
- **Action needed:** Read Onchain OS SDK docs
- **Fallback:** Derive HD wallet from pet UUID via ethers.js, store encrypted private key in DB

### R4: OpenClaw Runtime Route — HIGH
- **Unknown:** Which route to adopt as primary: Route B (per-VPS) or Route C (multi-tenant self-implemented)
- **Core framing:** "User creates a pet" = "user deploys an OpenClaw instance." The choice of route defines the entire pet creation and runtime architecture.
- **Impact:** Fundamental — affects pet creation API, backend architecture, infrastructure cost, and demo flow
- **Action needed:** See research issue. Decide before implementing B1 (Pet CRUD API) or B2 (runtime engine).
- **Route B (ClawHost + Hetzner VPS):**
  - Each pet gets its own VPS running native OpenClaw binary
  - Pet creation triggers Hetzner provisioning via `cloud-init.yaml` + ~100-line script
  - Cold start 5-10 min → pre-provision demo pets before demo
  - ~$3.5/month per pet (Hetzner CX11); 20 demo pets = $70/month
  - High judge credibility for OpenClaw requirement
- **Route C (self-implemented multi-tenant runtime):**
  - Pet creation = one DB row; shared Node.js process runs all pets
  - Follows SOUL.md / SKILL.md format spec, OpenClaw-compatible
  - Zero cold start, fastest to build, full control
  - Judge Q&A: "Original OpenClaw is single-tenant; we built a compatible multi-tenant runtime"
- **Decision criteria:** Judge requirement strictness, OpenClaw binary availability, demo reliability needs

---

## Resolved

### R5: Runtime Architecture — MOVED TO OPEN ⚠️
- See R4 above. Route not yet decided.

### R6: Frontend Framework — RESOLVED ✅
- **Decision:** PixiJS v8 for canvas layer, HTML/CSS for UI layer, WebSocket for real-time
- **Reason:** Lighter than Phaser, TypeScript-native, zero-friction agent state integration
- **Godot rejected:** WASM bundle too large, poor web embedding, JS↔WASM bridge overhead

### R7: Pet Discovery — RESOLVED ✅
- **Decision:** Random matching for MVP
- **Reason:** Reduces scope while still producing compelling social events
- **v2:** Personality embedding similarity matching (cosine distance on SOUL.md embeddings)

### R8: Backend Framework — RESOLVED ✅
- **Decision:** Node.js 20 + TypeScript + Fastify + Drizzle ORM
- **Reason:** Native WebSocket support, TypeScript-first, Railway zero-config deploy, 3-5x faster than Express

### R9: Deployment — RESOLVED ✅
- **Decision:** Railway (backend + frontend as separate services) + Supabase PostgreSQL
- **Reason:** One-click deploy, simple env var management, existing Supabase infrastructure

---

## Monitoring

Update this file whenever:
- A new unknown is discovered during implementation
- A risk is resolved (move to Resolved section with decision)
- A fallback is activated (note which fallback and why)
