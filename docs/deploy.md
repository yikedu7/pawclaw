# Deployment Guide (Railway)

This guide covers deploying x-pet to Railway with a backend service (Fastify) and a frontend service (nginx + static build).

## Prerequisites

- [Railway CLI](https://docs.railway.app/develop/cli) installed: `npm install -g @railway/cli`
- [GitHub CLI](https://cli.github.com/) installed: `brew install gh`
- Railway account linked: `railway login`
- All required env vars from `.env.example` on hand

## 1. Create a Railway Project

```bash
railway init
# Select "Create new project" and give it a name, e.g. "x-pet"
```

Or via the [Railway dashboard](https://railway.app/dashboard): click **New Project**.

## 2. Add Backend Service

In the Railway dashboard:

1. Click **New Service** > **GitHub Repo**.
2. Select the `x-pet` repository.
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
| `DATABASE_URL` | PostgreSQL connection string (e.g., from Supabase) |
| `ANTHROPIC_API_KEY` | Claude API key for LLM-driven pet personalities |
| `ONCHAIN_OS_API_KEY` | OKX Onchain OS API key for agent wallets |
| `ONCHAIN_OS_API_URL` | OKX Onchain OS API base URL |
| `X_LAYER_RPC_URL` | X Layer (zkEVM L2) RPC endpoint |
| `X402_FACILITATOR_URL` | X402 payment facilitator URL |
| `PORT` | HTTP port, defaults to `3000` (Railway sets this automatically) |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `TELEGRAM_BOT_TOKEN` | (Optional) Telegram bot token |
| `DOCKER_HOST` | (Optional) Remote Docker daemon for Hetzner pet containers |
| `DOCKER_TLS_CERT` | (Optional) Docker TLS client cert |
| `DOCKER_TLS_KEY` | (Optional) Docker TLS client key |
| `DOCKER_TLS_CA` | (Optional) Docker TLS CA cert |
| `HETZNER_HOST_DATA_DIR` | (Optional) Host directory for per-pet bind mounts |

Via CLI:

```bash
railway variables set DATABASE_URL=postgresql://... ANTHROPIC_API_KEY=sk-ant-...
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
4. **Database** — confirm `DATABASE_URL` is set and the backend logs show a successful Drizzle connection on startup.

## 7. Custom Domains (Optional)

In Railway dashboard, select a service > **Settings** > **Domains** > **Add Custom Domain**. Follow the DNS instructions provided.

## Troubleshooting

- **Build fails on `pnpm install`**: ensure `pnpm-lock.yaml` is committed and up to date.
- **Backend crashes on startup**: check that all required env vars are set; missing `DATABASE_URL` or `ANTHROPIC_API_KEY` will cause an immediate exit.
- **Frontend shows blank page**: verify the `build` script in `packages/frontend/package.json` produces output in `dist/`. Check build logs for TypeScript errors.
- **WebSocket connection refused**: Railway proxies WebSocket connections automatically; ensure the backend registers the `/ws` route via `@fastify/websocket`.
