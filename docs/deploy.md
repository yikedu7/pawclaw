# Deployment Guide (Railway)

This guide covers deploying PawClaw to Railway with a backend service (Fastify) and a frontend service (nginx + static build).

## Prerequisites

- [Railway CLI](https://docs.railway.app/develop/cli) installed: `npm install -g @railway/cli`
- [GitHub CLI](https://cli.github.com/) installed: `brew install gh`
- Railway account linked: `railway login`
- All required env vars from `.env.example` on hand

## 1. Create a Railway Project

```bash
railway init
# Select "Create new project" and give it a name, e.g. "pawclaw"
```

Or via the [Railway dashboard](https://railway.app/dashboard): click **New Project**.

## 2. Add Backend Service

In the Railway dashboard:

1. Click **New Service** > **GitHub Repo**.
2. Select the `pawclaw` repository.
3. Under **Source**, set **Root Directory** to `packages/backend`.
4. Railway will detect the `Dockerfile` automatically.
5. Rename the service to `backend`.

Or via CLI from the repo root:

```bash
railway service create --name backend
railway link  # link current directory to the project
```

## 3. Add Frontend Service

In the Railway dashboard:

1. Click **New Service** > **GitHub Repo** (same repo).
2. Under **Source**, set **Root Directory** to `packages/frontend`.
3. Railway will detect the `Dockerfile` automatically.
4. Rename the service to `frontend`.

## 4. Set Environment Variables

For the **backend** service, add all variables from `.env.example`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase Pooler URL (port 6543, `?pgbouncer=true`) — used by the app for all queries |
| `DATABASE_MIGRATION_URL` | Supabase direct connection URL (port 5432) — used only by the migration runner at startup; DDL statements require a direct connection and will fail silently over the Pooler |
| `ANTHROPIC_API_KEY` | Claude API key for LLM-driven pet personalities |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `BACKEND_URL` | Public URL of this backend service (used in generated SKILL.md files) |
| `OKX_API_KEY` | OKX Onchain OS API key — forwarded to per-pet OpenClaw containers |
| `OKX_SECRET_KEY` | OKX Onchain OS API secret — forwarded to per-pet OpenClaw containers |
| `OKX_PASSPHRASE` | OKX Onchain OS passphrase — forwarded to per-pet OpenClaw containers |
| `PAYMENT_TOKEN_ADDRESS` | ERC-3009 token contract address on X Layer (eip155:196) |
| `PAYMENT_TOKEN_NAME` | Token name, e.g. `OKB` |
| `PAYMENT_TOKEN_SYMBOL` | Token symbol, e.g. `OKB` |
| `BACKEND_RELAYER_PRIVATE_KEY` | Private key of the backend relayer wallet that submits `transferWithAuthorization` txs |
| `PORT` | HTTP port, defaults to `3000` (Railway sets this automatically) |
| `OPENCLAW_WEBHOOK_TOKEN` | (Optional) Bearer token the backend validates on all `/internal/openclaw/*` callbacks from OpenClaw containers |
| `HETZNER_HOST` | (Optional) Hostname or IP of the Hetzner VPS running pet containers |
| `HETZNER_USER` | (Optional) SSH username on the Hetzner VPS, e.g. `deploy` |
| `HETZNER_SSH_KEY` | (Optional) PEM-encoded ed25519 private key for SSH access to Hetzner (used by `dockerode` SSH transport) |
| `HETZNER_HOST_DATA_DIR` | (Optional) Host directory for per-pet bind mounts, defaults to `/data/pets` |
| `TELEGRAM_BOT_TOKEN` | (Optional) Telegram bot token |

Via CLI:

```bash
railway variables set \
  DATABASE_URL=postgresql://user:pass@host:6543/db?pgbouncer=true \
  DATABASE_MIGRATION_URL=postgresql://user:pass@host:5432/db \
  ANTHROPIC_API_KEY=sk-ant-...
```

The **frontend** service requires no backend env vars; it is purely static content served by nginx.

## 5. First Deploy

Railway automatically triggers a deploy on every push to the linked branch. To trigger manually:

```bash
railway up
```

Monitor the build logs in the Railway dashboard or:

```bash
railway logs --service backend
railway logs --service frontend
```

## 6. Verification

After both services are running:

1. **Backend health check** — visit `https://<backend-url>/health`. Expect `{"status":"ok"}`.
2. **Frontend** — visit `https://<frontend-url>/`. The PixiJS canvas should load.
3. **WebSocket** — open browser DevTools > Network > WS. Connect to `wss://<backend-url>/ws`. Expect a connection without errors.
4. **Database** — confirm both `DATABASE_URL` and `DATABASE_MIGRATION_URL` are set. The backend logs should show `Running migrations...` followed by `Migrations complete.` before the server starts listening.

## 7. Custom Domains (Optional)

In Railway dashboard, select a service > **Settings** > **Domains** > **Add Custom Domain**. Follow the DNS instructions provided.

## Deployed Contracts

| Contract | Network | Address |
|----------|---------|---------|
| PAW Token (ERC20) | X Layer testnet (eip155:195) | `0x03a30dFd83b7932cac2371aC5eaf20E24fe6E7ff` |

Deployer wallet: `0x63D7f271Efb88501F7B1E066846257a10cE058fA` (key stored in `packages/backend/.deploy-wallet`, gitignored).


## Troubleshooting

- **Build fails on `pnpm install`**: ensure `pnpm-lock.yaml` is committed and up to date.
- **Backend crashes on startup**: check that all required env vars are set; missing `DATABASE_URL` or `ANTHROPIC_API_KEY` will cause an immediate exit.
- **Migration fails at startup**: the container will exit before the server starts. Check Railway logs for the error. Common causes: `DATABASE_MIGRATION_URL` not set (falls back to `DATABASE_URL` which may be the Pooler URL — DDL fails over PgBouncer), or the `drizzle/` folder is missing from the image (should not happen after this fix).
- **Frontend shows blank page**: verify the `build` script in `packages/frontend/package.json` produces output in `dist/`. Check build logs for TypeScript errors.
- **WebSocket connection refused**: Railway proxies WebSocket connections automatically; ensure the backend registers the `/ws` route via `@fastify/websocket`.
