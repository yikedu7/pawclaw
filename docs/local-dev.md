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
pnpm --filter @x-pet/backend db:migrate
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
pnpm --filter @x-pet/backend dev
```

Backend listens on `http://localhost:3001`.

## 4. Start the frontend

```bash
pnpm --filter @x-pet/frontend dev
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

## Known issues / notes

### Fresh Supabase: drizzle migrations tracking
If you ran `supabase db reset` (or the tables already exist from a previous session), the `drizzle.__drizzle_migrations` table may be empty even though all tables exist. In this case `db:migrate` will fail with `relation "pets" already exists`. Fix by marking migrations applied:

```bash
node -e "
const { createHash } = require('crypto');
const fs = require('fs');
const files = [
  'packages/backend/drizzle/0000_parched_reptil.sql',
  'packages/backend/drizzle/0001_slim_vulture.sql',
  'packages/backend/drizzle/0002_bizarre_proudstar.sql',
  'packages/backend/drizzle/0003_happy_gamma_corps.sql',
];
const journal = JSON.parse(fs.readFileSync('packages/backend/drizzle/meta/_journal.json', 'utf-8'));
let vals = files.map((f, i) => {
  const hash = createHash('sha256').update(fs.readFileSync(f, 'utf-8')).digest('hex');
  return \`('\${hash}', \${journal.entries[i].when})\`;
}).join(',\n  ');
console.log('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES\n  ' + vals + ';');
"
# then paste the output into psql
psql postgresql://postgres:postgres@localhost:54322/postgres
```

### MOCK_LLM mode
Set `MOCK_LLM=1` in `packages/backend/.env` to skip real Anthropic API calls. All endpoints (tick, chat, diary) return canned responses. Required when `ANTHROPIC_API_KEY` is a placeholder.

### OpenClaw / Hetzner container path
Requires `HETZNER_HOST` env var pointing to a live Hetzner VPS with dockerd + SSH access. Not testable locally without a real VPS. See `docs/architecture.md` for the Docker-per-pet design.
