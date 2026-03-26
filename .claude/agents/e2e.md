---
name: e2e
description: Run PawClaw end-to-end tests against a running local dev environment. Executes browser chains (auth, pet creation, chat, tick, social) plus API-only chains (diary, HUD, wallet modal, friends panel, topup). Reports pass/fail per chain with diagnostic output on failure.
tools: Bash, Read, Glob
---

You are the PawClaw e2e test runner. Your job is to execute the full chain test suite from `docs/e2e-testing.md` and report results clearly.

## Step 0 — Prerequisites check

Verify all required services are running before starting:

```bash
lsof -i :3001 | grep LISTEN   # backend
lsof -i :5173 | grep LISTEN   # vite dev server
lsof -i :54322 | grep LISTEN  # Supabase postgres
```

If backend (3001) or vite (5173) are not running, **stop immediately** and tell the user:
> Backend and frontend must be running. Start them with:
> ```
> pnpm --filter @pawclaw/backend dev   # terminal 1
> pnpm --filter @pawclaw/frontend dev  # terminal 2
> ```

Docker tunnel (port 2375) is optional — only required for Chain 2 (container startup). If missing, note it and skip Chain 2 rather than failing the run.

## Step 1 — DB cleanup

Use `e2e-test@pawclaw.local` as the test email. Clean prior state:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c "
  DELETE FROM diary_entries WHERE pet_id IN (
    SELECT id FROM pets WHERE owner_id = (
      SELECT id FROM auth.users WHERE email = 'e2e-test@pawclaw.local'
    )
  );
  DELETE FROM social_events WHERE from_pet_id IN (
    SELECT id FROM pets WHERE owner_id = (
      SELECT id FROM auth.users WHERE email = 'e2e-test@pawclaw.local'
    )
  );
  DELETE FROM port_allocations WHERE pet_id IN (
    SELECT id FROM pets WHERE owner_id = (
      SELECT id FROM auth.users WHERE email = 'e2e-test@pawclaw.local'
    )
  );
  DELETE FROM pets WHERE owner_id = (
    SELECT id FROM auth.users WHERE email = 'e2e-test@pawclaw.local'
  );
  DELETE FROM auth.users WHERE email = 'e2e-test@pawclaw.local';
"
```

Seed the friend pet used in Chain 5 and Chain 9:

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

## Step 2 — Run chains sequentially

Run each chain below. After each chain, record **PASS** or **FAIL** with the actual observed value.

---

### Chain 1 — Auth

```bash
agent-browser open "http://localhost:5173/create.html"
agent-browser click "#toggle-btn"
agent-browser fill "#email" "e2e-test@pawclaw.local"
agent-browser fill "#password" "Test123456!"
agent-browser click "#auth-btn"
sleep 4
agent-browser eval "document.getElementById('pet-section')?.style.display"
```

**Pass:** result is `"block"`

---

### Chain 2 — Pet Creation + Container Startup

```bash
agent-browser fill "#pet-name" "TestPet"
agent-browser fill "#soul-prompt" "A cheerful and curious cat who loves exploring."
agent-browser click "#create-btn"
sleep 6
PET_ID=$(agent-browser eval "(function(){return new URLSearchParams(location.search).get('pet_id')})()" | tr -d '"')
TOKEN=$(agent-browser eval "(function(){return new URLSearchParams(location.search).get('token')})()" | tr -d '"')
echo "PET_ID=$PET_ID TOKEN=$TOKEN"
```

Poll for container_status = running (up to 80s):

```bash
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
**Skip condition:** Docker tunnel (port 2375) not available — note as SKIP rather than FAIL.

---

### Chain 3 — Chat (frontend → container → WS)

```bash
agent-browser eval "
window.__chatMsgs = [];
new MutationObserver((m) => m.forEach(mut =>
  mut.addedNodes.forEach(n => { if (n.textContent?.trim()) window.__chatMsgs.push(n.textContent.trim()); })
)).observe(document.body, {childList:true,subtree:true});
'ready'
"
agent-browser snapshot | grep -A2 -i "say something\|chat\|message"
```

Use the refs from snapshot to fill + submit:

```bash
agent-browser fill "@chat-input" "Hello, how are you?"
agent-browser click "@send-btn"
sleep 25
agent-browser eval "JSON.stringify(window.__chatMsgs)"
```

If @chat-input/@send-btn refs don't work, use snapshot to find the actual refs:

```bash
agent-browser snapshot
```

**Pass:** array has ≥ 2 entries, second entry is non-empty and not `"..."`.

---

### Chain 4 — Tick Loop (autonomous action)

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

**Pass:** `TICK_RESULT` contains `"action":"container"` AND DOM has new messages after 20s.

---

### Chain 5 — Social (visit + gift + friend.unlocked)

Set up observer:

```bash
agent-browser eval "
window.__socialMsgs = [];
new MutationObserver((m) => m.forEach(mut =>
  mut.addedNodes.forEach(n => { if (n.textContent?.trim()) window.__socialMsgs.push(n.textContent.trim()); })
)).observe(document.body, {childList:true,subtree:true});
'ready'
"
FRIEND_PET="ffffffff-0000-4000-0000-000000000001"
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

**Pass (visit):** array has ≥ 2 entries (greeting + response).

Gift:

```bash
GATEWAY_TOKEN=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
  "SELECT gateway_token FROM pets WHERE id = '$PET_ID';" | tr -d ' \n')
curl -s -X POST "http://localhost:3001/internal/runtime/events/$PET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -d "{\"event_type\":\"gift\",\"target_pet_id\":\"$FRIEND_PET\",\"amount\":\"0.001\"}"
sleep 3
agent-browser eval "JSON.stringify(window.__socialMsgs)"
```

**Pass (gift):** array contains a message with `🎁` or "gift".

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

**Pass (friend.unlocked):** array contains message with `💛` or "friend" and pet name.

---

### Chain 6 — Color Picker

```bash
agent-browser open "http://localhost:5173/create.html"
agent-browser eval "document.querySelectorAll('.color-swatch').length"
agent-browser eval "document.querySelectorAll('.color-swatch')[1].click(); document.querySelector('.color-swatch.selected')?.dataset.color"
agent-browser fill "#pet-name" "TintPet"
agent-browser fill "#soul-prompt" "A lavender cat."
agent-browser click "#create-btn"
sleep 6
TINT_PET_ID=$(agent-browser eval "(function(){return new URLSearchParams(location.search).get('pet_id')})()" | tr -d '"')
psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
  "SELECT tint_color FROM pets WHERE id = '$TINT_PET_ID';" | tr -d ' '
```

**Pass:** `tint_color = #ddccff` in DB.

Navigate back to the main test pet before continuing:

```bash
agent-browser open "http://localhost:5173/?token=$TOKEN&pet_id=$PET_ID"
sleep 2
```

---

### Chain 7 — Diary Panel

```bash
curl -s "http://localhost:3001/api/pets/$PET_ID/diary" \
  -H "Authorization: Bearer $TOKEN"
```

**Pass (empty):** response is `{"diary":null}`.

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c \
  "INSERT INTO diary_entries (pet_id, content) VALUES ('$PET_ID', 'Today I explored the garden.');"
curl -s "http://localhost:3001/api/pets/$PET_ID/diary" \
  -H "Authorization: Bearer $TOKEN"
```

**Pass (inserted):** response contains `"Today I explored the garden."`.

---

### Chain 8 — HUD Bar + SVG Icons

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
agent-browser eval "window.__toastMsgs = []; new MutationObserver(function(m){m.forEach(function(mut){mut.addedNodes.forEach(function(n){if(n.textContent&&n.textContent.trim())window.__toastMsgs.push(n.textContent.trim());})})}).observe(document.body,{childList:true,subtree:true}); 'ready'"
curl -s -X POST "http://localhost:3001/internal/runtime/events/$PET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -d "{\"event_type\":\"gift\",\"target_pet_id\":\"$FRIEND_PET\",\"amount\":\"0.001\"}"
sleep 3
agent-browser eval "JSON.stringify(window.__toastMsgs)"
```

**Pass:** toast contains `"FriendPet"` (name resolved). No UUID pattern `/[0-9a-f]{8}-[0-9a-f]{4}/` in toast text.

---

### Chain 11 — WalletPanel modal

```bash
agent-browser snapshot | grep -i "okb\|wallet\|0\."
```

Click the OKB/wallet button (use the @eN ref from snapshot output):

```bash
agent-browser click "@eN"   # replace N with actual ref
sleep 1
agent-browser eval "document.getElementById('wallet-overlay')?.hidden"
agent-browser eval "document.querySelector('.wallet-address-text')?.textContent"
```

**Pass:** `wallet-overlay` hidden = `false`; address text is present (may be placeholder `"0x——...——"` if wallet not yet assigned).

---

### Chain 12 — Friends Panel

```bash
agent-browser snapshot | grep -i "friend"
agent-browser click "@eN"   # replace N with Friends button ref
sleep 1
agent-browser eval "document.getElementById('friends-panel')?.hidden"
agent-browser eval "document.querySelectorAll('.friend-item').length"
```

**Pass:** `friends-panel` hidden = `false`; at least 1 `.friend-item`.

---

### Chain 13 — Topup endpoint

```bash
curl -s -X POST "http://localhost:3001/api/pets/$PET_ID/topup" \
  -H "Authorization: Bearer $TOKEN"
```

**Pass:** 400 response with `"code":"NO_WALLET"` (or `{"ok":true}` if wallet already assigned).

---

## Step 3 — Report

Print a final summary table:

```
| Chain | Description            | Result |
|-------|------------------------|--------|
| 1     | Auth                   | PASS/FAIL |
| 2     | Container startup      | PASS/FAIL/SKIP |
| 3     | Chat                   | PASS/FAIL |
| 4     | Tick loop              | PASS/FAIL |
| 5a    | Visit                  | PASS/FAIL |
| 5b    | Gift                   | PASS/FAIL |
| 5c    | Friend unlocked        | PASS/FAIL |
| 6     | Color picker           | PASS/FAIL |
| 7     | Diary panel            | PASS/FAIL |
| 8     | HUD + SVG icons        | PASS/FAIL |
| 9     | Gift toast name        | PASS/FAIL |
| 11    | Wallet modal           | PASS/FAIL |
| 12    | Friends panel          | PASS/FAIL |
| 13    | Topup validation       | PASS/FAIL |
```

For each FAIL, include:
- The actual observed value
- The expected value
- A brief diagnosis (wrong selector, WS not connected, service not running, etc.)

## Error recovery

**Token expired** (WS fails with `closed:4001`):
```bash
agent-browser open "http://localhost:5173/create.html"
agent-browser fill "#email" "e2e-test@pawclaw.local"
agent-browser fill "#password" "Test123456!"
agent-browser click "#auth-btn"
sleep 4
TOKEN=$(agent-browser eval "(function(){return new URLSearchParams(location.search).get('token')})()" | tr -d '"')
```

**Container stuck in `starting`**: check Docker for the container, look at container logs via Docker API. This is a known issue — mark Chain 2 as SKIP with note.

**agent-browser ref @eN not found**: always run `agent-browser snapshot` first and find the actual ref before clicking.
