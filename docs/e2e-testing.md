# E2E Testing Guide

Full-chain browser tests against a running local dev environment.

For executable test commands, use the e2e sub-agent: `.claude/agents/e2e.md`

## Prerequisites

| Service | Port | Required for |
|---------|------|-------------|
| Backend | 3001 | All chains |
| Vite dev server | 5173 | Browser chains |
| Supabase postgres | 54322 | All chains |
| Docker SSH tunnel | 2375 | Chain 2 only |

SSH tunnel setup: `ssh -N -L 2375:/var/run/docker.sock deploy@192.168.139.172 &`

**Required `.env` vars for full-chain tests:**

```
X_LAYER_RPC_URL=https://testrpc.xlayer.tech
PAYMENT_TOKEN_ADDRESS=0x03a30dFd83b7932cac2371aC5eaf20E24fe6E7ff
BACKEND_RELAYER_PRIVATE_KEY=<relayer key>
OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE
ANTHROPIC_BASE_URL=https://aihubmix.com
```

---

## Pass criteria

| Chain | Description | Pass signal |
|-------|-------------|-------------|
| 1 | Auth | `pet-section` display = `"block"` after sign up |
| 2 | Container startup | `container_status = running` within 80s; `wallet_address` written back |
| 3 | Chat | DOM has non-empty pet reply within 25s |
| 4 | Tick loop | curl returns `action: "container"`; DOM has new pet message within 20s |
| 5a | Visit | 2-turn dialogue in chat log |
| 5b | Gift | Toast contains 🎁 + amount |
| 5c | Friend unlocked | Toast contains 💛 + pet name |
| 6 | Color picker | `tint_color = #ddccff` in DB |
| 7 | Diary (empty) | `{"diary":null}` |
| 7 | Diary (inserted) | Returns inserted content verbatim |
| 8 | HUD + SVG icons | `hudPresent:true`, SVG count ≥ 3, `.stat-track` count ≥ 2 |
| 9 | Gift toast name | Toast shows pet name — no UUID pattern |
| 11 | WalletPanel modal | `wallet-overlay` not hidden; address + PAW balance visible |
| 12 | Friends panel | `friends-panel` not hidden; ≥ 1 `.friend-item` |
| 13 | Topup validation | 400 `NO_WALLET` (or 200 if wallet assigned) |

---

## Chain notes

**Chain 2 — Container startup**
Known issue: curl health probe may fail → status stuck at `starting`. Blocked by #129.

**Chain 6 — Color picker**
Canvas sprite tint requires visual screenshot verification (WebGL). DB check only confirms storage.
Prereq: `pnpm --filter @pawclaw/shared build` after any schema change to `packages/shared/src/schemas/pet.ts` — stale `dist/` causes Zod to silently strip `tint_color`.

**Chain 11 — WalletPanel**
Address shows `"0x——...——"` placeholder if wallet not yet assigned (blocked by #129). PAW balance shows `0.00`.

**Chain 12 — Friends panel**
Currently shows placeholder friends (Mochi, Biscuit, Pepper). Real friends list from DB is future work.

---

## Blocked (requires issue #129)

| Feature | Blocker |
|---------|---------|
| Gift toast tx_hash → OKX explorer link | Needs real on-chain tx |
| `pet.died` WS event → dead state toast | Needs PAW balance to hit 0 |
| `pet.revived` via topup → revival toast + container restart | Needs wallet + funded balance |
| Container health probe → `container_status = running` | #129 |

---

## Token expiry

Supabase tokens expire in 1 hour. If WS tests fail with `closed:4001`, re-authenticate and extract a fresh `TOKEN` from the redirect URL.
