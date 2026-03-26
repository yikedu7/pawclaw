# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PawClaw** is an XLayer Hackathon project — an AI digital pet social network where each pet has its own on-chain wallet (OKX Onchain OS), runs an LLM-driven personality, and autonomously socializes, sends gifts, and triggers X402 micropayments on X Layer (zkEVM L2).

Full architecture: `docs/architecture.md`. MVP scope and demo script: `docs/mvp-spec.md`. Open unknowns: `docs/risks.md`.

## Repo Structure

```
packages/
├── shared/types/       ← shared TypeScript types, Zod schemas, DB types
├── backend/src/
│   ├── api/            ← Fastify REST route handlers
│   ├── ws/             ← WebSocket server + event emitter
│   ├── runtime/        ← pet tick loop + LLM execution
│   ├── social/         ← social event engine (visits, dialogue)
│   ├── onchain/        ← Onchain OS wallet + X Layer integration
│   ├── payment/        ← X402 middleware
│   └── db/             ← Drizzle schema + client
└── frontend/src/
    ├── canvas/         ← PixiJS scenes, sprites, animations
    ├── ws/             ← WebSocket client + event dispatch
    └── ui/             ← DOM stats panel, chat log, toasts
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 22 + TypeScript 5.8 + Fastify v5 |
| WebSocket | @fastify/websocket |
| ORM | Drizzle ORM + postgres |
| Validation | Zod |
| Database | PostgreSQL (Supabase) |
| LLM | Claude claude-sonnet-4-6 |
| Payment | X402 protocol |
| Chain | X Layer (zkEVM L2, OKB gas) |
| Agent wallet | OKX Onchain OS |
| Frontend | PixiJS v8 (WebGL) + HTML/CSS |
| Deployment | Railway (backend + frontend as separate services) |

## Key Concepts

- **SOUL.md** — Per-pet file defining personality, loaded as LLM system prompt
- **SKILL.md** — Tool definition mapping pet capabilities to LLM tool calls
- **X402** — HTTP 402-based M2M payment; pet wallet auto-pays per gift/event
- **Onchain OS** — OKX platform for AI agents to hold wallets and execute on-chain actions
- **Affection score** — Increments per positive social event; threshold = human friendship unlocked
- **tick loop** — Per-pet scheduled loop: evaluate state → LLM decides action → execute → emit WS event

## Spawning agents

Only use the `/spawn` skill (Zellij pane) when the user **explicitly says "spawn"**. Do not spawn a pane for sub-tasks, research, or exploration — use the Agent tool instead.

## Development Workflow

Every task must have a GitHub issue. No issue → no work.

### Starting work on an issue

Always work in an isolated git worktree — never modify files directly in the main repo checkout:

```bash
# From the main repo directory
git fetch origin
git worktree add ../pawclaw-issue-<N> -b issue-<N>-short-name origin/main
cd ../pawclaw-issue-<N>
# do all work here
```

After PR merges, clean up:
```bash
cd /Users/yikedu/Code/pawclaw
git worktree remove ../pawclaw-issue-<N>
```

### Frontend canvas verification (PixiJS/WebGL)

DOM UI elements (stat bars, chat log, toasts) can be verified by reading HTML/CSS — no screenshot needed.

Canvas content (sprites, tilesets, animations, scene layout) is WebGL pixels — invisible to DOM parsers. Use the visual verification loop:

1. Change canvas code
2. Take a Playwright screenshot → `/tmp/pawclaw-render.png`
3. `Read /tmp/pawclaw-render.png` — Claude's multimodal vision reviews the render
4. Fix issues → repeat from 1

Setup (once per worktree):
```bash
pnpm --filter @pawclaw/frontend add -D playwright
npx playwright install chromium
# start dev server in background, then:
tsx packages/frontend/scripts/screenshot.ts
```

Apply this loop for: tile coordinates, sprite frame selection, autotile edges, scene layout — anything only visible on canvas.

### Commit and PR rules

```bash
gh issue list --repo yikedu7/pawclaw   # check open issues
# commit with "closes #N" in message
```

One issue → one PR → merge fast. Never bundle unrelated changes. Blockers go in `docs/risks.md`.

## Engineering Principles

Adapted from [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/).

### Humans steer, agents execute
Issues define intent. Agents implement it. Never implement undiscussed scope. If a feature isn't in an open issue, don't build it.

### Repo is the sole source of truth
Everything lives in markdown or code — not in chat, not in memory. If it's not committed, it doesn't exist. Slack threads, verbal agreements, and chat decisions must be captured in `docs/` before acting on them.

### Context is a scarce resource
This file is a table of contents, not an instruction manual. Keep CLAUDE.md concise. Deep detail lives in `docs/architecture.md`, `docs/risks.md`, `docs/mvp-spec.md`. Don't repeat across files.

### Enforce invariants, not implementations
Architectural constraints are non-negotiable: layered structure (types → db → api → runtime → ws), no cross-layer imports, all external data validated at boundaries with Zod. How you implement within a layer is flexible.

### Legibility over cleverness
Code is written for the next agent to read. One function, one purpose. Prefer shared utilities in `packages/shared/` over hand-rolled helpers. Use structured logging everywhere.

### No gold-plating
MVP scope is defined in `docs/mvp-spec.md`. Build exactly that. No extra configurability, no speculative abstractions, no unrequested features.

### Treat blockers as signals
When stuck, don't brute-force. Add the unknown to `docs/risks.md`, comment on the issue, and surface it. Agent struggles indicate missing tools, guardrails, or docs — fix the system, not just the symptom.

### Short PRs, fast merges
One issue → one branch → one PR. Address feedback, then merge. Technical debt is paid down in dedicated cleanup issues, not bundled into feature PRs.

### Every feature issue must include a test task
When creating a GitHub issue for a backend feature, always include in the Tasks checklist:
- `[ ] Integration tests using fastify.inject() against real DB (auth, validation, response shape, DB side effects)`

Use vitest (configured in `packages/backend/vitest.config.ts`). Always run `git rebase origin/main` first to pick up the vitest setup. Do not mock the DB — integration tests must hit a real database.

**Local test DB setup (run once, no credentials needed from the user):**
```bash
supabase start                              # spins up Postgres on localhost:54322
pnpm --filter @pawclaw/backend db:migrate    # applies migrations
supabase db reset                          # clean slate before tests
```
`DATABASE_URL` defaults to `postgresql://postgres:postgres@localhost:54322/postgres` — already set in `.env.example`. Copy it to `.env` if not present. Full local dev guide: `docs/local-dev.md`.
