# PawClaw E2E Browser Test

Full-chain test using agent-browser. Tests all 5 chains against a running local dev environment.

## Prerequisites check

Before starting, verify:

```bash
lsof -i :3001 | grep LISTEN   # backend
lsof -i :5173 | grep LISTEN   # vite
lsof -i :2375 | grep LISTEN   # SSH tunnel to OrbStack VM (Docker)
lsof -i :54322 | grep LISTEN  # Supabase postgres
```

If backend or vite are not running, tell the user to start them first.
If SSH tunnel is missing: `ssh -N -L 2375:/var/run/docker.sock deploy@192.168.139.172 &`

## DB cleanup

Clear test state before each run:

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c "
  DELETE FROM port_allocations;
  DELETE FROM social_events WHERE from_pet_id IN (SELECT id FROM pets WHERE owner_id = (SELECT id FROM auth.users WHERE email = '$EMAIL'));
  DELETE FROM pets WHERE owner_id = (SELECT id FROM auth.users WHERE email = '$EMAIL');
  DELETE FROM auth.users WHERE email = '$EMAIL';
"
```

Use `e2e-test@pawclaw.local` as the test email. Also stop/remove any leftover containers:

```bash
curl -s "http://localhost:2375/containers/json?all=true" | python3 -c "
import sys,json
for c in json.load(sys.stdin):
    print(c['Id'][:12], c['State'], c['Names'])
"
# Remove any found containers:
# curl -s -X DELETE "http://localhost:2375/containers/<id>?force=true"
```

---

## Chain 1 — Auth

**Goal:** sign up → redirect to pet page with `?token=`

```bash
agent-browser open "http://localhost:5173/create.html"
agent-browser click "#toggle-btn"          # switch to Sign Up mode
agent-browser fill "#email" "e2e-test@pawclaw.local"
agent-browser fill "#password" "Test123456!"
agent-browser click "#auth-btn"
sleep 4
agent-browser eval "location.href"
```

**Pass:** URL contains `/?token=` and `&pet_id=` — wait, it won't yet (no pet). Check pet-section visible:

```bash
agent-browser eval "document.getElementById('pet-section')?.style.display"
# expect: "block"
```

**Fail signals:** `error-msg` non-empty, still on `/create.html` without pet-section.

---

## Chain 2 — Pet Creation + Container Startup

**Goal:** create pet → container starts → `container_status = running` within 60s

```bash
agent-browser fill "#pet-name" "TestPet"
agent-browser fill "#soul-prompt" "A cheerful and curious cat who loves exploring."
agent-browser click "#create-btn"
sleep 5
agent-browser eval "location.href"    # should be /?token=...&pet_id=...
```

Extract `pet_id` from URL, then poll DB:

```bash
PET_ID=$(agent-browser eval "(function(){return new URLSearchParams(location.search).get('pet_id')})()" | tr -d '"')
for i in $(seq 1 6); do
  STATUS=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
    "SELECT container_status FROM pets WHERE id = '$PET_ID';" | tr -d ' ')
  echo "[$i] container_status: $STATUS"
  [ "$STATUS" = "running" ] && break
  sleep 10
done
```

**Pass:** `container_status = running`
**Fail signals:** stays `starting` after 60s (check Docker: `curl -s "http://localhost:2375/containers/json?all=true"`), or `error` in DB.

---

## Chain 3 — Chat (frontend → container → WS)

**Goal:** user sends chat → OpenClaw LLM replies → appears in chat log via WS

Set up DOM observer first:

```bash
agent-browser eval "
window.__chatMsgs = [];
new MutationObserver((m) => m.forEach(mut =>
  mut.addedNodes.forEach(n => { if (n.textContent?.trim()) window.__chatMsgs.push(n.textContent.trim()); })
)).observe(document.body, {childList:true,subtree:true});
'ready'
"
```

Send message via UI:

```bash
agent-browser fill "@e1" "Hello, how are you?"   # @e1 is the chat input (from snapshot)
agent-browser click "@e2"                          # send button
sleep 25   # LLM takes ~15s
agent-browser eval "JSON.stringify(window.__chatMsgs)"
```

**Pass:** array contains two entries — user message + pet reply with actual content (not `null`, not `"..."`).

If refs @e1/@e2 don't work, use snapshot to find them:
```bash
agent-browser snapshot | grep -A2 "Say something"
```

---

## Chain 4 — Tick Loop (autonomous action)

**Goal:** manual tick → container processes → WS event appears in chat log

```bash
PET_ID=<from earlier>
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

**Pass:** `{"ok":true,"action":"container"}` and DOM contains a new pet message.
**Fail signals:** `action` is not `"container"` (container not running), or DOM empty after 20s (WS not connected).

---

## Chain 5 — Social (visit + gift + friend.unlocked)

**Goal:** visit → dialogue in chat log. gift → gift toast. affection ≥ 100 → friend.unlocked toast.

First create a second pet in DB (no container needed):

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c "
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('aaaaaaaa-bbbb-4000-cccc-dddddddddddd','friend@pawclaw.local',
  crypt('Test123456!',gen_salt('bf')), now(),now(),now(),
  '{\"provider\":\"email\"}','{}','authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pets (id,owner_id,name,soul_md,skill_md,hunger,mood,affection,container_status)
VALUES ('ffffffff-0000-4000-0000-000000000001',
  'aaaaaaaa-bbbb-4000-cccc-dddddddddddd',
  'FriendPet','A friendly pet.','# skills',80,75,5,'stopped')
ON CONFLICT (id) DO NOTHING;
"
FRIEND_PET="ffffffff-0000-4000-0000-000000000001"
```

Set up observer and trigger visit:

```bash
agent-browser eval "
window.__socialMsgs = [];
new MutationObserver((m) => m.forEach(mut =>
  mut.addedNodes.forEach(n => { if (n.textContent?.trim()) window.__socialMsgs.push(n.textContent.trim()); })
)).observe(document.body, {childList:true,subtree:true});
'ready'
"

curl -s -X POST "http://localhost:3001/internal/tools/visit_pet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-dev-webhook-token" \
  -d "{\"pet_id\":\"$PET_ID\",\"target_pet_id\":\"$FRIEND_PET\",\"greeting\":\"Hi there!\"}"
sleep 5
agent-browser eval "JSON.stringify(window.__socialMsgs)"
```

**Pass (visit):** two dialogue lines in DOM (from_pet greeting + to_pet response).

Gift:

```bash
GATEWAY_TOKEN=$(psql postgresql://postgres:postgres@localhost:54322/postgres -t -c \
  "SELECT gateway_token FROM pets WHERE id = '$PET_ID';" | tr -d ' ')

curl -s -X POST "http://localhost:3001/internal/runtime/events/$PET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -d "{\"event_type\":\"gift\",\"target_pet_id\":\"$FRIEND_PET\",\"amount\":\"0.001\"}"
sleep 2
agent-browser eval "JSON.stringify(window.__socialMsgs)"
```

**Pass (gift):** DOM contains `🎁` gift message.

Friend unlocked (boost affection then visit again):

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

**Pass (friend.unlocked):** DOM contains `💛` friend unlocked message.

---

## Token expiry handling

Supabase access tokens expire in **1 hour**. If any WS test fails with `closed:4001`:

```bash
agent-browser open "http://localhost:5173/create.html"
# sign in again (not sign up)
agent-browser fill "#email" "e2e-test@pawclaw.local"
agent-browser fill "#password" "Test123456!"
agent-browser click "#auth-btn"
sleep 4
# page should redirect to /?token=NEW_TOKEN&pet_id=...
```

Then resume the test from where it left off.

---

## Pass criteria summary

| Chain | Signal |
|-------|--------|
| 1 Auth | `pet-section` visible after sign up |
| 2 Container | `container_status = running` within 60s |
| 3 Chat | DOM has pet reply (not null/empty) within 25s |
| 4 Tick | DOM has autonomous pet message within 20s |
| 5 Visit | DOM has 2-turn dialogue |
| 5 Gift | DOM has 🎁 gift message |
| 5 Friend | DOM has 💛 friend unlocked message |
