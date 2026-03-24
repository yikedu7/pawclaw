# E2E Testing Guide

Full-chain browser tests using `agent-browser` against a running local dev environment.

## Prerequisites

```bash
lsof -i :3001 | grep LISTEN   # backend
lsof -i :5173 | grep LISTEN   # vite
lsof -i :2375 | grep LISTEN   # SSH tunnel to OrbStack VM (Docker)
lsof -i :54322 | grep LISTEN  # Supabase postgres
```

If SSH tunnel is missing: `ssh -N -L 2375:/var/run/docker.sock deploy@192.168.139.172 &`

**Required `.env` vars** (backend must have all of these for full-chain tests):

```
X_LAYER_RPC_URL=https://testrpc.xlayer.tech   # X Layer testnet — missing = PAW balance calls hit mainnet and fail
PAYMENT_TOKEN_ADDRESS=0x03a30dFd83b7932cac2371aC5eaf20E24fe6E7ff
BACKEND_RELAYER_PRIVATE_KEY=<relayer key>
OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE  # onchainos login inside container
ANTHROPIC_BASE_URL=https://aihubmix.com        # LLM proxy
```

After adding env vars, **restart the backend** (tsx watch does not reload on .env changes):
```bash
kill $(lsof -ti :3001) && sleep 5
# or: kill the child node process, tsx watcher respawns it
```

## DB + container cleanup

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c "
  DELETE FROM port_allocations;
  DELETE FROM social_events;
  DELETE FROM pets;
  DELETE FROM auth.users WHERE email LIKE '%xpet.local%';
"
curl -s "http://localhost:2375/containers/json?all=true" | python3 -c "
import sys,json
for c in json.load(sys.stdin): print(c['Id'][:12], c['State'], c['Names'])
"
# curl -s -X DELETE "http://localhost:2375/containers/<id>?force=true"
```

---

## Chain 1 — Auth

**Goal:** sign up → redirect to pet page with `pet-section` visible

```bash
agent-browser open "http://localhost:5173/create.html"
agent-browser click "#toggle-btn"
agent-browser fill "#email" "e2e-test@xpet.local"
agent-browser fill "#password" "Test123456!"
agent-browser click "#auth-btn"
sleep 4
agent-browser eval "document.getElementById('pet-section')?.style.display"
# expect: "block"
```

**Pass:** `pet-section` display is `"block"`.

---

## Chain 2 — Pet Creation + Container Startup

**Goal:** create pet → container starts → `container_status = running` within 60s

```bash
agent-browser fill "#pet-name" "TestPet"
agent-browser fill "#soul-prompt" "A cheerful and curious cat who loves exploring."
agent-browser click "#create-btn"
sleep 6
PET_ID=$(agent-browser eval "new URLSearchParams(location.search).get('pet_id')" | tr -d '"')
TOKEN=$(agent-browser eval "new URLSearchParams(location.search).get('token')" | tr -d '"')

for i in $(seq 1 8); do
  STATUS=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
    "SELECT container_status FROM pets WHERE id = '$PET_ID';" | tr -d ' \n')
  echo "[$i] container_status: $STATUS"
  [ "$STATUS" = "running" ] && break
  sleep 10
done
```

**Pass:** `container_status = running`.
**Known issue:** blocked by #129 (curl probe fails → status stuck at `starting`).

---

## Chain 3 — Chat (frontend → container → WS)

**Goal:** user sends chat → pet replies via WS → appears in chat log

```bash
agent-browser eval "
window.__chatMsgs = [];
new MutationObserver((m) => m.forEach(mut =>
  mut.addedNodes.forEach(n => { if (n.textContent?.trim()) window.__chatMsgs.push(n.textContent.trim()); })
)).observe(document.body, {childList:true,subtree:true});
'ready'
"
agent-browser snapshot | grep -A2 "Say something"   # find @e1/@e2 refs
agent-browser fill "@e1" "Hello, how are you?"
agent-browser click "@e2"
sleep 25
agent-browser eval "JSON.stringify(window.__chatMsgs)"
```

**Pass:** array has two entries — user message + non-empty pet reply.

---

## Chain 4 — Tick Loop (autonomous action)

**Goal:** manual tick → container processes → pet message appears in DOM

```bash
agent-browser eval "
window.__tickMsgs = [];
new MutationObserver((m) => m.forEach(mut =>
  mut.addedNodes.forEach(n => { if (n.textContent?.trim()) window.__tickMsgs.push(n.textContent.trim()); })
)).observe(document.body, {childList:true,subtree:true});
'ready'
"
curl -s -X POST "http://localhost:3001/internal/tick/$PET_ID" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}'
sleep 20
agent-browser eval "JSON.stringify(window.__tickMsgs)"
```

**Pass:** curl returns `{"ok":true,"action":"container"}` and DOM has new pet message.

---

## Chain 5 — Social (visit + gift + friend.unlocked)

**Goal:** visit → dialogue in chat. gift → gift toast. affection ≥ 100 → friend.unlocked toast.

Create friend pet (no container needed):

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c "
INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,aud,role)
VALUES ('aaaaaaaa-bbbb-4000-cccc-dddddddddddd','friend@xpet.local',
  crypt('Test123456!',gen_salt('bf')),now(),now(),now(),
  '{\"provider\":\"email\"}','{}','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO pets (id,owner_id,name,soul_md,skill_md,hunger,mood,affection,container_status)
VALUES ('ffffffff-0000-4000-0000-000000000001','aaaaaaaa-bbbb-4000-cccc-dddddddddddd',
  'FriendPet','A friendly pet.','# skills',80,75,5,'stopped')
ON CONFLICT (id) DO NOTHING;
"
FRIEND_PET="ffffffff-0000-4000-0000-000000000001"
```

Set up observer:

```bash
agent-browser eval "
window.__socialMsgs = [];
new MutationObserver((m) => m.forEach(mut =>
  mut.addedNodes.forEach(n => { if (n.textContent?.trim()) window.__socialMsgs.push(n.textContent.trim()); })
)).observe(document.body, {childList:true,subtree:true});
'ready'
"
```

Visit:

```bash
curl -s -X POST "http://localhost:3001/internal/tools/visit_pet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-dev-webhook-token" \
  -d "{\"pet_id\":\"$PET_ID\",\"target_pet_id\":\"$FRIEND_PET\",\"greeting\":\"Hi there!\"}"
sleep 5
agent-browser eval "JSON.stringify(window.__socialMsgs)"
```

**Pass (visit):** two dialogue lines in DOM.

Gift:

```bash
GATEWAY_TOKEN=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
  "SELECT gateway_token FROM pets WHERE id = '$PET_ID';" | tr -d ' ')
curl -s -X POST "http://localhost:3001/internal/runtime/events/$PET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -d "{\"event_type\":\"gift\",\"target_pet_id\":\"$FRIEND_PET\",\"amount\":\"0.001\"}"
sleep 3
agent-browser eval "JSON.stringify(window.__socialMsgs)"
```

**Pass (gift):** toast contains gift icon + `0.001`.

Friend unlocked:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c \
  "UPDATE pets SET affection = 95 WHERE id = '$PET_ID';"
curl -s -X POST "http://localhost:3001/internal/tools/visit_pet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-dev-webhook-token" \
  -d "{\"pet_id\":\"$PET_ID\",\"target_pet_id\":\"$FRIEND_PET\",\"greeting\":\"You're my best friend!\"}"
sleep 5
agent-browser eval "JSON.stringify(window.__socialMsgs)"
```

**Pass (friend.unlocked):** toast contains friend unlocked icon + pet name.

---

## Chain 6 — Color Picker (PR #122)

**Goal:** pet created with tint_color → stored in DB

```bash
agent-browser open "http://localhost:5173/create.html"
# sign in first (skip sign up toggle if already registered)
agent-browser eval "document.querySelectorAll('.color-swatch').length"
# expect: >= 3
agent-browser eval "document.querySelectorAll('.color-swatch')[1].click(); document.querySelector('.color-swatch.selected')?.dataset.color"
# expect: "#ddccff" (lavender)
agent-browser fill "#pet-name" "TintPet"
agent-browser fill "#soul-prompt" "A lavender cat."
agent-browser click "#create-btn"
sleep 6
TINT_PET_ID=$(agent-browser eval "new URLSearchParams(location.search).get('pet_id')" | tr -d '"')
psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
  "SELECT tint_color FROM pets WHERE id = '$TINT_PET_ID';" | tr -d ' '
# expect: #ddccff
```

**Pass:** `tint_color = #ddccff` in DB.
**Note:** canvas sprite tint requires visual screenshot verification (WebGL).
**Prereq:** Run `pnpm --filter @x-pet/shared build` after any schema change to `packages/shared/src/schemas/pet.ts` — stale `dist/` causes Zod to silently strip new fields from parsed request bodies.

---

## Chain 7 — Diary Panel (PR #124)

**Goal:** empty diary returns null; inserted entry is returned from DB (no LLM call)

```bash
curl -s "http://localhost:3001/api/pets/$PET_ID/diary" \
  -H "Authorization: Bearer $TOKEN"
# expect: {"diary":null}

psql postgresql://postgres:postgres@localhost:54322/postgres -c \
  "INSERT INTO diary_entries (pet_id, content) VALUES ('$PET_ID', 'Today I explored the garden.');"

curl -s "http://localhost:3001/api/pets/$PET_ID/diary" \
  -H "Authorization: Bearer $TOKEN"
# expect: {"diary":"Today I explored the garden."}
```

**Pass (empty):** `{"diary":null}`
**Pass (inserted):** returns inserted content, not LLM-generated text.

---

## Chain 8 — HUD Bar + SVG Icons (PR #101 + #116)

**Goal:** HUD stat bars visible; icons are SVG elements not emoji text

```bash
agent-browser eval "
const hud = document.getElementById('hud-bar');
const svgs = hud?.querySelectorAll('svg');
JSON.stringify({ hudPresent: !!hud, svgCount: svgs?.length ?? 0, trackCount: hud?.querySelectorAll('.stat-track').length ?? 0 })
"
# expect: hudPresent:true, svgCount >= 3, trackCount >= 2
```

**Pass:** `hudPresent: true`, SVG count ≥ 3, track count ≥ 2 (actual selectors: `.stat-track`, `.stat-fill`).

---

## Chain 9 — Gift toast shows pet name, not UUID (PR #125 / #126)

**Goal:** gift toast shows resolved pet name — "Sent a gift to FriendPet" or "Received a gift from FriendPet"

Sender side (page is the sender's pet):

```bash
GATEWAY_TOKEN=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
  "SELECT gateway_token FROM pets WHERE id = '$PET_ID';" | tr -d ' ')
agent-browser eval "window.__toastMsgs = []; new MutationObserver(function(m){m.forEach(function(mut){mut.addedNodes.forEach(function(n){if(n.textContent&&n.textContent.trim())window.__toastMsgs.push(n.textContent.trim());})})}).observe(document.body,{childList:true,subtree:true}); 'ready'"
curl -s -X POST "http://localhost:3001/internal/runtime/events/$PET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -d "{\"event_type\":\"gift\",\"target_pet_id\":\"$FRIEND_PET\",\"amount\":\"0.001\"}"
sleep 3
agent-browser eval "JSON.stringify(window.__toastMsgs)"
```

**Pass (sender):** toast contains `"Sent a gift to FriendPet"` — pet name, not UUID.

**Pass (no UUID):** toast text does NOT match `/[0-9a-f]{8}-[0-9a-f]{4}/`.

---

## Chain 10 — Visitor animation (PR #120) — canvas

**Goal:** visit event renders visitor sprite entering from right

```bash
curl -s -X POST "http://localhost:3001/internal/tools/visit_pet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-dev-webhook-token" \
  -d "{\"pet_id\":\"$PET_ID\",\"target_pet_id\":\"$FRIEND_PET\",\"greeting\":\"Hello!\"}"
sleep 2
SCREENSHOT_URL="http://localhost:5173/?token=$TOKEN&pet_id=$PET_ID" \
SCREENSHOT_DELAY_MS=500 \
npx tsx packages/frontend/scripts/screenshot.ts
# Read /tmp/x-pet-render.png — verify two sprites visible
```

**Pass:** screenshot shows two pet sprites on canvas (resident + visitor).

---

## Chain 11 — WalletPanel modal (PR #128 + #133)

**Goal:** click OKB balance in HUD → wallet modal opens with address and PAW balance

```bash
agent-browser eval "document.querySelector('#hud-bar .hud-okb-btn, #hud-bar [data-wallet]')?.click(); 'clicked'"
# if click selector unknown, use snapshot:
# agent-browser snapshot | grep -i "okb\|wallet\|0\."
```

Or click via snapshot ref:

```bash
agent-browser snapshot | grep -i "okb\|0\.0"
# find @eN ref for OKB balance button, then:
agent-browser click "@eN"
sleep 1
agent-browser eval "document.getElementById('wallet-overlay')?.hidden"
# expect: false
agent-browser eval "document.querySelector('.wallet-address-text')?.textContent"
# expect: truncated address like "0x1234...5678"
```

**Pass:** `wallet-overlay` not hidden; PAW Balance section and Token Assets section visible.
**Note:** address shows `"0x——...——"` placeholder if pet has no wallet (blocked by #129); PAW balance shows `0.00 PAW`.

---

## Chain 12 — Friends Panel (PR #100)

**Goal:** click Friends in HUD → panel opens with friend list

```bash
agent-browser snapshot | grep -i "friend"   # find @eN ref for Friends button
agent-browser click "@eN"
sleep 1
agent-browser eval "document.getElementById('friends-panel')?.hidden"
# expect: false
agent-browser eval "document.querySelectorAll('.friend-item').length"
# expect: >= 1
```

**Pass:** `friends-panel` not hidden; `.friend-item` count ≥ 1.
**Note:** currently shows placeholder friends (Mochi, Biscuit, Pepper) — real friends list from DB is future work.

---

## Chain 13 — Topup endpoint validation (PR #113)

**Goal:** `POST /api/pets/:id/topup` returns `NO_WALLET` when wallet not assigned

```bash
curl -s -X POST "http://localhost:3001/api/pets/$PET_ID/topup" \
  -H "Authorization: Bearer $TOKEN"
# expect: {"error":"Wallet not assigned yet","code":"NO_WALLET"}
```

**Pass:** 400 with `"code":"NO_WALLET"`.
**Blocked (requires #129):** with real wallet — topup reads on-chain PAW balance, revives stopped container, emits `pet.revived` WS event.

---

## Token expiry

Supabase tokens expire in 1 hour. If WS tests fail with `closed:4001`:

```bash
agent-browser open "http://localhost:5173/create.html"
agent-browser fill "#email" "e2e-test@xpet.local"
agent-browser fill "#password" "Test123456!"
agent-browser click "#auth-btn"
sleep 4
# page redirects to /?token=NEW_TOKEN&pet_id=...
TOKEN=$(agent-browser eval "new URLSearchParams(location.search).get('token')" | tr -d '"')
```

---

## Blocked (requires issue #129)

| Chain | Feature |
|-------|---------|
| — | gift toast tx_hash links to OKX explorer (needs real on-chain tx) |
| — | `pet.died` WS event → dead state toast + hunger=0 (needs PAW balance to hit 0) |
| — | `pet.revived` via topup → revival toast + container restart |

---

## Pass criteria summary

| Chain | Signal |
|-------|--------|
| 1 Auth | `pet-section` display = `"block"` |
| 2 Container | `container_status = running` within 60s; `wallet_address` written back |
| 2 PAW credits | `paw_balance = 200.0` after topup; hunger bar = 100% |
| 3 Chat | DOM has non-empty pet reply within 25s |
| 4 Tick | `action: "container"` + DOM has pet message within 25s |
| 5 Visit | 2-turn dialogue in chat log |
| 5 Gift | Toast contains gift icon + amount |
| 5 Friend | Friend unlocked toast with pet name |
| 6 Color | `tint_color = #ddccff` in DB |
| 7 Diary | Empty → `{"diary":null}`; inserted → content returned |
| 8 HUD | `hudPresent:true`, SVG count ≥ 3, `.stat-track` count ≥ 2 |
| 9 Gift name | Toast says "Sent a gift to FriendPet" / "Received a gift from FriendPet" — no UUID |
| 10 Visitor | Screenshot shows 2 sprites on canvas |
| 11 WalletPanel | Modal opens; PAW Balance + Token Assets sections visible |
| 12 Friends | Panel opens; friend items visible |
| 13 Topup | No-wallet → `{"code":"NO_WALLET"}` 400 |
