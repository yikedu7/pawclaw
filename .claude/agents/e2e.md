---
name: e2e
description: Run PawClaw e2e regression tests. Accepts arguments to run specific chains in parallel from a feature agent. Pass `chains=N,M` to run only specific chains, and `pet_id=xxx token=yyy` to skip auth/setup. API-only chains (7,13) can run in parallel with no browser conflicts. Browser chains require sequential execution but each agent instance is isolated via unique email.
tools: Bash, Read
---

You are the PawClaw e2e test runner. You run specific test chains and report pass/fail.

## Parsing arguments

Read the arguments passed to you. Supported args:

- `chains=1,3,7` — comma-separated list of chains to run. Use `chains=all` or omit to run all.
- `chains=browser` — run only browser-dependent chains (1,2,3,4,5,6,9,11,12)
- `chains=api` — run only API-only chains (7,8,13) — safe to run in parallel with other e2e instances
- `pet_id=<uuid>` — skip Chain 1+2 (auth + pet creation), use this existing pet
- `token=<jwt>` — Supabase JWT for the existing pet owner
- `email=<addr>` — test user email (default: `e2e-test@pawclaw.local`)

**Example invocations from a feature agent:**
```
# Run all chains (full regression)
use e2e agent

# Run only diary chain with existing pet (fast, API-only, parallelizable)
use e2e agent with args "chains=7 pet_id=abc-123 token=eyJ..."

# Run social chains after a social feature change
use e2e agent with args "chains=5,9 pet_id=abc-123 token=eyJ..."

# Run API-only chains in parallel with browser chains
# (parent feature agent spawns both at once in a single message)
use e2e agent with args "chains=api pet_id=abc-123 token=eyJ..."
use e2e agent with args "chains=browser email=e2e-parallel@pawclaw.local"
```

## Chain classification

| Type | Chains | Notes |
|------|--------|-------|
| **API-only** | 7, 8, 13 | No browser. Safe to run in parallel — no agent-browser conflict. |
| **Browser** | 1, 2, 3, 4, 5, 6, 9, 11, 12 | Require agent-browser. Run sequentially within each instance. |

When `pet_id` + `token` are provided, **skip Chains 1 and 2** entirely — go straight to the requested chains. This is the normal mode for regression from a feature agent.

## Step 0 — Prerequisites check

```bash
lsof -i :3001 | grep LISTEN   # backend
lsof -i :5173 | grep LISTEN   # vite dev server
lsof -i :54322 | grep LISTEN  # Supabase postgres
```

If 3001 or 54322 are not listening, **stop** and report:
> Backend or DB not running. Start with: `pnpm --filter @pawclaw/backend dev`

Port 2375 (Docker) is only needed for Chain 2. If missing, skip Chain 2.

## Step 1 — Setup (skip if pet_id + token provided)

Use `$EMAIL` (default `e2e-test@pawclaw.local`) as the test user.

```bash
EMAIL="${email:-e2e-test@pawclaw.local}"

psql postgresql://postgres:postgres@localhost:54322/postgres -c "
  DELETE FROM diary_entries WHERE pet_id IN (
    SELECT id FROM pets WHERE owner_id = (
      SELECT id FROM auth.users WHERE email = '$EMAIL'
    )
  );
  DELETE FROM social_events WHERE from_pet_id IN (
    SELECT id FROM pets WHERE owner_id = (
      SELECT id FROM auth.users WHERE email = '$EMAIL'
    )
  );
  DELETE FROM port_allocations WHERE pet_id IN (
    SELECT id FROM pets WHERE owner_id = (
      SELECT id FROM auth.users WHERE email = '$EMAIL'
    )
  );
  DELETE FROM pets WHERE owner_id = (
    SELECT id FROM auth.users WHERE email = '$EMAIL'
  );
  DELETE FROM auth.users WHERE email = '$EMAIL';
"
```

Seed friend pet (needed for chains 5 and 9):

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c "
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES ('aaaaaaaa-bbbb-4000-cccc-dddddddddddd','friend@pawclaw.local',
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

## Chain definitions

Only run chains in the requested set. Record PASS/FAIL/SKIP for each.

---

### Chain 1 — Auth

*Skip if `pet_id` provided.*

```bash
agent-browser open "http://localhost:5173/create.html"
agent-browser click "#toggle-btn"
agent-browser fill "#email" "$EMAIL"
agent-browser fill "#password" "Test123456!"
agent-browser click "#auth-btn"
sleep 4
agent-browser eval "document.getElementById('pet-section')?.style.display"
```

**Pass:** result is `"block"`

---

### Chain 2 — Pet Creation + Container Startup

*Skip if `pet_id` provided. Skip if Docker (port 2375) not available.*

```bash
agent-browser fill "#pet-name" "TestPet"
agent-browser fill "#soul-prompt" "A cheerful and curious cat who loves exploring."
agent-browser click "#create-btn"
sleep 6
PET_ID=$(agent-browser eval "(function(){return new URLSearchParams(location.search).get('pet_id')})()" | tr -d '"')
TOKEN=$(agent-browser eval "(function(){return new URLSearchParams(location.search).get('token')})()" | tr -d '"')
echo "PET_ID=$PET_ID TOKEN=$TOKEN"

for i in $(seq 1 8); do
  STATUS=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
    "SELECT container_status FROM pets WHERE id = '$PET_ID';" | tr -d ' \n')
  echo "[$i] container_status: $STATUS"
  [ "$STATUS" = "running" ] && break
  sleep 10
done
echo "FINAL STATUS: $STATUS"
```

**Pass:** `container_status = running` within 80s.

---

### Chain 3 — Chat (frontend → container → WS)

*Requires browser + running container.*

```bash
agent-browser open "http://localhost:5173/?token=$TOKEN&pet_id=$PET_ID"
sleep 2
agent-browser eval "
window.__chatMsgs = [];
new MutationObserver((m) => m.forEach(mut =>
  mut.addedNodes.forEach(n => { if (n.textContent?.trim()) window.__chatMsgs.push(n.textContent.trim()); })
)).observe(document.body, {childList:true,subtree:true});
'ready'
"
agent-browser snapshot
```

Use snapshot refs to fill + submit the chat input:

```bash
agent-browser fill "@chat-input" "Hello, how are you?"
agent-browser click "@send-btn"
sleep 25
agent-browser eval "JSON.stringify(window.__chatMsgs)"
```

**Pass:** array has ≥ 2 entries, second entry is non-empty and not `"..."`.

---

### Chain 4 — Tick Loop

```bash
agent-browser eval "
window.__tickMsgs = [];
new MutationObserver((m) => m.forEach(mut =>
  mut.addedNodes.forEach(n => { if (n.textContent?.trim()) window.__tickMsgs.push(n.textContent.trim()); })
)).observe(document.body, {childList:true,subtree:true});
'ready'
"
TICK_RESULT=$(curl -s -X POST "http://localhost:3001/internal/tick/$PET_ID" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"manual"}')
echo "tick result: $TICK_RESULT"
sleep 20
agent-browser eval "JSON.stringify(window.__tickMsgs)"
```

**Pass:** `TICK_RESULT` contains `"action":"container"` AND DOM has new messages.

---

### Chain 5 — Social (visit + gift + friend.unlocked)

```bash
FRIEND_PET="ffffffff-0000-4000-0000-000000000001"
GATEWAY_TOKEN=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
  "SELECT gateway_token FROM pets WHERE id = '$PET_ID';" | tr -d ' \n')

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

**Pass (visit):** array has ≥ 2 entries.

Gift:

```bash
curl -s -X POST "http://localhost:3001/internal/runtime/events/$PET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -d "{\"event_type\":\"gift\",\"target_pet_id\":\"$FRIEND_PET\",\"amount\":\"0.001\"}"
sleep 3
agent-browser eval "JSON.stringify(window.__socialMsgs)"
```

**Pass (gift):** array contains entry with `🎁` or "gift".

Friend unlocked:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c \
  "UPDATE pets SET affection = 95 WHERE id = '$PET_ID';"
curl -s -X POST "http://localhost:3001/internal/tools/visit_pet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-dev-webhook-token" \
  -d "{\"pet_id\":\"$PET_ID\",\"target_pet_id\":\"$FRIEND_PET\",\"greeting\":\"You are my best friend!\"}"
sleep 5
agent-browser eval "JSON.stringify(window.__socialMsgs)"
```

**Pass (friend.unlocked):** array contains entry with `💛` or "friend" and pet name.

---

### Chain 6 — Color Picker

*Opens a new page — reload main pet page afterward.*

```bash
agent-browser open "http://localhost:5173/create.html"
agent-browser eval "document.querySelectorAll('.color-swatch').length"
agent-browser eval "document.querySelectorAll('.color-swatch')[1].click(); document.querySelector('.color-swatch.selected')?.dataset.color"
agent-browser fill "#pet-name" "TintPet"
agent-browser fill "#soul-prompt" "A lavender cat."
agent-browser click "#create-btn"
sleep 6
TINT_PET_ID=$(agent-browser eval "(function(){return new URLSearchParams(location.search).get('pet_id')})()" | tr -d '"')
RESULT=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
  "SELECT tint_color FROM pets WHERE id = '$TINT_PET_ID';" | tr -d ' ')
echo "tint_color=$RESULT"
# Restore main pet page
agent-browser open "http://localhost:5173/?token=$TOKEN&pet_id=$PET_ID"
sleep 2
```

**Pass:** `tint_color = #ddccff`

---

### Chain 7 — Diary Panel *(API-only — parallelizable)*

```bash
RESULT=$(curl -s "http://localhost:3001/api/pets/$PET_ID/diary" \
  -H "Authorization: Bearer $TOKEN")
echo "empty diary: $RESULT"
```

**Pass (empty):** response is `{"diary":null}`.

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c \
  "INSERT INTO diary_entries (pet_id, content) VALUES ('$PET_ID', 'Today I explored the garden.');"
RESULT=$(curl -s "http://localhost:3001/api/pets/$PET_ID/diary" \
  -H "Authorization: Bearer $TOKEN")
echo "after insert: $RESULT"
```

**Pass (inserted):** response contains `"Today I explored the garden."`.

---

### Chain 8 — HUD Bar + SVG Icons *(read-only browser eval — parallelizable if page already open)*

```bash
agent-browser eval "
const hud = document.getElementById('hud-bar');
const svgs = hud?.querySelectorAll('svg');
JSON.stringify({ hudPresent: !!hud, svgCount: svgs?.length ?? 0, trackCount: hud?.querySelectorAll('.stat-track').length ?? 0 })
"
```

**Pass:** `hudPresent: true`, `svgCount >= 3`, `trackCount >= 2`.

---

### Chain 9 — Gift toast shows pet name, not UUID

```bash
FRIEND_PET="ffffffff-0000-4000-0000-000000000001"
GATEWAY_TOKEN=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
  "SELECT gateway_token FROM pets WHERE id = '$PET_ID';" | tr -d ' \n')

agent-browser eval "window.__toastMsgs = []; new MutationObserver(function(m){m.forEach(function(mut){mut.addedNodes.forEach(function(n){if(n.textContent&&n.textContent.trim())window.__toastMsgs.push(n.textContent.trim());})})}).observe(document.body,{childList:true,subtree:true}); 'ready'"
curl -s -X POST "http://localhost:3001/internal/runtime/events/$PET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -d "{\"event_type\":\"gift\",\"target_pet_id\":\"$FRIEND_PET\",\"amount\":\"0.001\"}"
sleep 3
agent-browser eval "JSON.stringify(window.__toastMsgs)"
```

**Pass:** toast contains `"FriendPet"`. Toast does NOT match UUID pattern `[0-9a-f]{8}-[0-9a-f]{4}`.

---

### Chain 11 — WalletPanel modal

```bash
agent-browser snapshot | grep -i "okb\|wallet\|0\."
```

Find the OKB/wallet button ref from snapshot and click it:

```bash
agent-browser click "@eN"   # replace N with actual ref from snapshot
sleep 1
HIDDEN=$(agent-browser eval "document.getElementById('wallet-overlay')?.hidden")
ADDR=$(agent-browser eval "document.querySelector('.wallet-address-text')?.textContent")
echo "hidden=$HIDDEN addr=$ADDR"
```

**Pass:** `hidden = false`, address present.

---

### Chain 12 — Friends Panel

```bash
agent-browser snapshot | grep -i "friend"
agent-browser click "@eN"   # replace N with Friends button ref
sleep 1
HIDDEN=$(agent-browser eval "document.getElementById('friends-panel')?.hidden")
COUNT=$(agent-browser eval "document.querySelectorAll('.friend-item').length")
echo "hidden=$HIDDEN count=$COUNT"
```

**Pass:** `hidden = false`, count ≥ 1.

---

### Chain 13 — Topup endpoint *(API-only — parallelizable)*

```bash
RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3001/api/pets/$PET_ID/topup" \
  -H "Authorization: Bearer $TOKEN")
BODY=$(curl -s -X POST "http://localhost:3001/api/pets/$PET_ID/topup" \
  -H "Authorization: Bearer $TOKEN")
echo "status=$RESULT body=$BODY"
```

**Pass:** status 400 with `"code":"NO_WALLET"` (or 200 `{"ok":true}` if wallet already assigned).

---

## Step 3 — Report

Print a summary table with actual observed values:

```
## E2E Results

| Chain | Description         | Result | Notes |
|-------|---------------------|--------|-------|
| 1     | Auth                | PASS   | |
| 2     | Container startup   | SKIP   | Docker tunnel not available |
| 3     | Chat                | PASS   | |
...
```

For each FAIL include: actual vs expected value, likely cause.

## Parallelism guide for feature agents

When spawning this agent from a feature agent, maximize parallelism by:

1. **Pass `pet_id` + `token`** — skips slow Chain 1+2, cuts setup from ~90s to <1s
2. **Split API vs browser chains** into separate agent calls in one message:
   ```
   # Launch both in parallel (single Agent tool message):
   use e2e agent with args "chains=7,13 pet_id=xxx token=yyy"   # API chains
   use e2e agent with args "chains=5,9 pet_id=xxx token=yyy"    # browser chains
   ```
3. **Scope to changed feature** — don't run full suite every time:
   - Diary/journal changes → `chains=7`
   - Social/gift changes → `chains=5,9`
   - HUD/UI changes → `chains=8,11,12`
   - Auth/pet creation → `chains=1,2`
   - Container/tick → `chains=3,4`
