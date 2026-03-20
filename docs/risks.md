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

### R2: Onchain OS Swap API — RESOLVED ✅

**Research conducted:** 2026-03-21 via OKX Onchain OS dev docs, onchainos-skills GitHub.

**Findings:**

1. **REST API is well-documented and production-ready.** Base URL: `https://web3.okx.com/api/v6/`
2. **Auth:** HMAC-SHA256 — 4 headers required on every request: `OK-ACCESS-KEY`, `OK-ACCESS-SIGN` (HMAC of `timestamp+method+path+queryString`), `OK-ACCESS-TIMESTAMP` (ISO 8601), `OK-ACCESS-PASSPHRASE`. API keys from [OKX Developer Portal](https://web3.okx.com/onchain-os/dev-portal) (up to 3 projects, 3 keys each).
3. **X Layer confirmed supported.** chainIndex `196`. DEX router contract: `0xD1b8997AaC08c619d40Be2e4284c9C72cAB33954`. Approval contract: `0x8b773D83bc66Be128c60e07E17C8901f7a64F000`. Native OKB address: `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`.
4. **Swap flow (EVM):**
   - `GET dex/aggregator/quote` — `chainIndex`, `fromTokenAddress`, `toTokenAddress`, `amount` (in smallest units), `slippagePercent`
   - `GET dex/aggregator/approve-transaction` — ERC-20 tokens only (skip for native OKB)
   - `GET dex/aggregator/swap` — same params + `userWalletAddress`; returns `tx.data`, `tx.to`, `tx.gas`, `tx.gasPrice`, `minReceiveAmount`
   - `POST dex/pre-transaction/broadcast-transaction` — body: `{ signedTx, chainIndex, address }`
5. **Clarification on gift mechanic:** Swap API is for token *conversion*. Pet-to-pet token gifts (direct ERC-20 transfer of a fixed token) use ethers.js `transfer()` directly — no Swap API needed. Swap API only relevant if gift involves cross-token conversion.

**Decision:** Use direct ethers.js ERC-20 `transfer()` for peer-to-pet gifts. Swap API available (no access barriers found) if token conversion gifting added in v2.

- **Docs:** https://web3.okx.com/onchainos/dev-docs/trade/dex-use-swap-quick-start

### R3: Onchain OS Agent Wallet — RESOLVED ✅ (fallback activated)

**Research conducted:** 2026-03-21 via OKX Onchain OS dev docs, onchainos-skills GitHub.

**Findings:**

1. **Onchain OS Agentic Wallet is NOT suitable for per-pet programmatic creation.** The wallet lifecycle is email + OTP based:
   - `onchainos wallet login <email>` → sends 6-digit OTP to email
   - `onchainos wallet verify <otp>` → creates/restores wallet, returns `accountId`
   - Private keys are generated inside a TEE; never exposed to the server
   - Each additional wallet under the same email: `onchainos wallet add`
2. **No server-side wallet creation API.** There is a "silent AK login" mode (`onchainos wallet login` without email, auth via API key) but this authenticates an *existing* account — it does not create a new isolated wallet per pet identity.
3. **Multi-chain support confirmed:** XLayer (196), Solana (501), Ethereum (1), Base (8453), BSC (56), Arbitrum (42161), 20+ chains total.
4. **CLI tool `onchainos`** wraps all wallet operations. SDK is a compiled binary distributed via GitHub releases; no Node.js library.

**Decision:** Fallback activated. Each pet wallet is an HD wallet derived from `keccak256(petUuid)` as entropy via ethers.js, encrypted private key stored in DB (AES-256-GCM, key from env). This gives fully autonomous, isolated wallets with no user interaction required. Onchain OS Agentic Wallet is still referenced in demo narrative ("each pet has its own onchain identity") but the key management model is ethers.js HD, not Onchain OS TEE.

- **Docs:** https://web3.okx.com/onchainos/dev-docs/home/install-your-agentic-wallet | https://github.com/okx/onchainos-skills

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
