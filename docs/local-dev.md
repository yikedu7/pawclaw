# Local Development Guide

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for Supabase local stack)
- Supabase CLI

## 1. Start Supabase

```bash
supabase start
```

This spins up a local Postgres instance on port 54322 and the Supabase Auth service on port 54321. After the first start, run migrations:

```bash
pnpm --filter @pawclaw/backend db:migrate
```

## 2. Configure environment

Copy the example env file and fill in your keys:

```bash
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env`:

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret used to sign/verify JWTs (min 32 chars) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (starts with `sk-ant-`) |
| `DATABASE_URL` | Postgres connection string — default matches `supabase start` |
| `BACKEND_URL` | Backend base URL for pet skill tool calls |

For the frontend, create `packages/frontend/.env.local`:

```bash
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<anon key printed by supabase start>
VITE_BACKEND_URL=http://localhost:3001
```

## 3. Start the backend

```bash
pnpm --filter @pawclaw/backend dev
```

Backend listens on `http://localhost:3001`.

## 4. Start the frontend

```bash
pnpm --filter @pawclaw/frontend dev
```

Frontend dev server listens on `http://localhost:5173`.

- Main canvas: `http://localhost:5173/`
- Create pet page: `http://localhost:5173/create.html`

## 5. Trigger a pet tick (curl)

Once a pet exists, you can manually trigger a tick to test the LLM → WS pipeline:

```bash
curl -X POST http://localhost:3001/internal/tick/<pet-id>
```

Replace `<pet-id>` with the UUID returned by `POST /api/pets`. The tick route is internal and requires no auth header.

## Full flow

1. Open `http://localhost:5173/create.html`
2. Sign up / sign in with email + password
3. Enter pet name and soul prompt → submit
4. Canvas loads at `http://localhost:5173/?token=<access_token>`
5. WebSocket connects; trigger a tick via curl to see the pet speak

## OpenClaw container integration (OrbStack local test)

The container lifecycle can be tested against an OrbStack VM (`hetzner-test`, Ubuntu 22.04) before deploying to Hetzner. This validates file writes, Docker health polling, DB state transitions, and port allocation.

### Prerequisites

- OrbStack VM `hetzner-test` running at `192.168.139.172`
- `deploy` user with your OrbStack SSH key installed
- `ghcr.io/openclaw/openclaw:latest` pulled on the VM (no auth needed — image is public)
- Supabase running locally

### Run the e2e test

```bash
# Write OrbStack key to a temp path (avoid /tmp/hetzner-test-key — macOS Keychain issue)
cp ~/.orbstack/ssh/id_ed25519 /tmp/hetzner-e2e-key && chmod 600 /tmp/hetzner-e2e-key

cd packages/backend && \
  HETZNER_HOST=192.168.139.172 \
  HETZNER_USER=deploy \
  HETZNER_SSH_KEY="$(cat ~/.orbstack/ssh/id_ed25519)" \
  HETZNER_SSH_KEY_FILE=/tmp/hetzner-e2e-key \
  HETZNER_HOST_DATA_DIR=/data/pets \
  DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
  ANTHROPIC_API_KEY=<your-key> \
  OPENCLAW_WEBHOOK_TOKEN=<your-token> \
  node_modules/.bin/tsx --env-file=.env scripts/e2e-container.ts
```

The script seeds a test pet, creates a container, waits for it to become healthy (via Docker HEALTHCHECK), verifies files on the VM, stops and removes the container, then cleans up all DB rows.

### Known limitation (R12)

Tick delivery to a running container (`POST /webhook/<petId>`) fails because the OpenClaw gateway binds to `127.0.0.1:18789` inside the container — Docker port binding cannot forward to a loopback-only service. The fix (container.exec() with curl) is tracked separately. This does not affect: container health polling (uses `docker inspect`), or tool call callbacks from OpenClaw to the backend (curl runs inside the container's network namespace and can reach 127.0.0.1 itself).
