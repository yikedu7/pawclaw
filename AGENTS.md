# x-pet — Agent Orientation

> **One-liner:** An AI digital pet with its own on-chain wallet on X Layer that autonomously socializes, gifts, and transacts — turning Web3 asset management into a living, emotional experience.

---

## What This Is

**x-pet** is a XLayer Hackathon project. It is an AI pet social network where each pet:
- Has an independent on-chain wallet (via OKX Onchain OS Agent Wallet)
- Runs an LLM-driven personality defined by a `SOUL.md` file
- Autonomously visits other pets, chats, sends gifts, and triggers X402 micropayments
- Accumulates affection scores → unlocks human-to-human friend connections

This is NOT a wallet app with a pet skin. The pet IS the economic and social agent. X Layer's low-cost zkEVM L2 is not optional — it is the reason high-frequency pet-to-pet micro-transactions are economically viable.

---

## Repo Layout

```
x-pet/
├── AGENTS.md          ← you are here (start here every session)
├── docs/
│   ├── architecture.md    ← system design, data models, API contracts
│   ├── mvp-spec.md        ← hackathon scope, demo script, judge criteria
│   ├── risks.md           ← open unknowns, fallback plans
│   └── soul-format.md     ← SOUL.md / SKILL.md spec reference
├── packages/
│   ├── backend/           ← Node.js API, pet runtime engine
│   ├── frontend/          ← PixiJS canvas + HTML/CSS UI
│   └── contracts/         ← (optional) any on-chain bits
└── .github/
    └── workflows/         ← CI
```

---

## Development Workflow

**Every task is a GitHub issue.** No issue → no work.

1. Check open issues: `gh issue list --repo yikedu7/x-pet`
2. Pick the highest-priority open issue
3. Create a branch: `git checkout -b issue-<N>-short-name`
4. Implement, commit with `closes #N` in the message
5. Open a PR — keep it short-lived, merge fast
6. Close issue on merge

**GitHub Project:** https://github.com/users/yikedu7/projects/1 (My Ops)
All x-pet issues should be added to this project and prioritized (P0/P1/P2).

---

## Architecture — Runtime Model (Route C)

We do NOT run the original OpenClaw binary (single-tenant, slow cold start). We implement a **multi-tenant OpenClaw-compatible runtime** in Node.js.

Each pet is a database row, not a process:

```
DB row: { id, soul_md, wallet_address, wallet_privkey_enc, history[], skills[], affection_map{} }
```

Pet execution cycle (triggered by scheduler or social event):
1. Load pet row
2. Parse `SOUL.md` → system prompt
3. Load `SKILL.md` tools → register as LLM tool calls
4. Pre-flight: deduct X402 payment from pet wallet before LLM call
5. Run LLM inference → handle tool calls (Swap, Send, etc.)
6. Persist history + any state changes
7. Emit WebSocket event to frontend

**Judge answer if asked about OpenClaw:** "We implement a multi-tenant runtime compatible with the OpenClaw SOUL.md/SKILL.md format. The original OpenClaw is single-tenant by design and not suitable for a social network with many concurrent pets."

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend runtime | Node.js + TypeScript | Same language as frontend, fast iteration |
| Database | PostgreSQL (Supabase) | Existing infra, row-per-pet model |
| LLM | Claude claude-sonnet-4-6 or GPT-4o | Best tool-call quality |
| Payment | X402 protocol | Machine-to-machine micropayments, no human approval |
| Chain | X Layer (zkEVM L2, OKB gas) | Low-cost, high-frequency micro-transactions |
| Agent wallet | OKX Onchain OS | Independent pet wallet, no user key exposure |
| On-chain swap | OKX Onchain OS Swap Skill | Gift/barter mechanic between pets |
| Frontend canvas | PixiJS v8 (WebGL) | Thin renderer, 500KB, TypeScript-native |
| Frontend UI | HTML + CSS over canvas | Chat logs, affection bars, toasts |
| Real-time | WebSocket | Drive both canvas and DOM from single event stream |
| Pet interface | Telegram Bot (optional) | Owner notification channel |

---

## MVP Scope (Hackathon Demo)

**Demo script (5 steps):**
1. Create pet → set personality prompt → Onchain OS generates wallet
2. Show pet's room: hunger/mood/social stats, one autonomous "today I met..." line
3. Pet auto-visits another pet → LLM-driven dialogue → affection event
4. Gift/compensation event → X402 payment fires → owner notified
5. Social graph: new friend unlocked, diary entry, on-chain tx record shown

**What judges care about (priority order):**
1. X Layer integration: demonstrate real on-chain micro-transactions
2. Onchain OS: Agent Wallet creation, pet-controlled signing, Swap skill
3. X402: M2M payment without human approval (the "magic moment")
4. Product story: emotional stickiness, QQ pet nostalgia → crypto native

**Non-goals for MVP:** NFT minting, complex match-making, real AR, user-uploaded assets.

---

## Harness Engineering Principles (adapted for this project)

These rules apply to every agent working in this repo:

1. **Humans steer, agents execute.** Issues define intent. Code implements it. Never implement undiscussed scope.
2. **Repo is the source of truth.** Everything lives in markdown or code. Not in chat, not in memory. If it's not in `docs/`, it doesn't exist.
3. **Legibility over cleverness.** Code is written for the next agent to read, not to impress humans. One function, one purpose.
4. **Taste as code.** Naming conventions, file-size limits, structured logging — these are enforced, not suggested. See `docs/architecture.md`.
5. **Short PRs, fast merges.** One issue → one PR. Never bundle unrelated changes.
6. **Known unknowns live in `docs/risks.md`.** When you discover a blocker, add it there and comment on the issue.
7. **No gold-plating.** MVP scope is defined above. Build exactly that, nothing more, until hackathon is shipped.

---

## Key Risks (summary — see docs/risks.md for detail)

| Risk | Status | Fallback |
|------|--------|----------|
| X402 LLM endpoint availability | Unknown | Simulate X402 flow with regular API Key |
| Onchain OS Swap API docs | Unknown | Stub with mock swap, show concept |
| Pet discovery mechanism | Decided: random for MVP | Character-similarity matching in v2 |
| OpenClaw judge requirement | Low risk | Route B (ClawHost + Hetzner) as fallback |

---

## Glossary

- **SOUL.md** — Frontmatter + prose file defining a pet's personality, loaded as LLM system prompt
- **SKILL.md** — Tool definition file; maps pet capabilities to LLM tool calls
- **X402** — HTTP 402-based machine-to-machine payment protocol; pet wallet auto-pays per LLM call
- **Onchain OS** — OKX's developer platform for AI agents to hold wallets and execute on-chain actions
- **X Layer** — OKX's zkEVM L2, OKB as gas token; used for all pet micro-transactions
- **Affection score** — Per-pet counter incremented by social events; threshold unlock = human friendship
- **Route C** — Our chosen architecture: custom multi-tenant OpenClaw-compatible Node.js runtime
