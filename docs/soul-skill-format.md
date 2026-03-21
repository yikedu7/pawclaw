# Generator File Format Specification

Defines the file formats produced by the four runtime generators and written to the
OpenClaw bind mounts at pet creation time.

| Generator | Output file | Bind mount path |
|-----------|-------------|-----------------|
| `config-generator.ts` | `openclaw.json` | `/data/pets/{id}/config/openclaw.json` |
| `soul-generator.ts` | `SOUL.md` | `/data/pets/{id}/workspace/SOUL.md` |
| `heartbeat-generator.ts` | `HEARTBEAT.md` | `/data/pets/{id}/workspace/HEARTBEAT.md` |
| `skill-generator.ts` | `SKILL.md` | `/data/pets/{id}/workspace/skills/x-pet/SKILL.md` |

---

## File Locations (inside OpenClaw container)

```
/home/node/.openclaw/              ← config bind mount
  openclaw.json                    ← model, heartbeat, webhook config
  workspace/                       ← workspace bind mount
    SOUL.md                        ← pet identity and personality
    HEARTBEAT.md                   ← proactive heartbeat checklist
    skills/
      x-pet/
        SKILL.md                   ← x-pet tool definitions
```

---

## SOUL.md

Loaded by OpenClaw as the LLM system prompt for every turn. Defines who the pet is.

### Schema

```
---
name: <string>           # pet display name, e.g. "Mochi"
species: <string>        # inferred from soul_prompt, e.g. "cat", "dragon", "unknown"
personality: <string>    # one-line trait summary extracted from soul_prompt
mood_baseline: <number>  # 0–100, initial mood stat from DB
---

<backstory>
One or more paragraphs describing the pet's origin, quirks, and default social behavior.
Derived from the soul_prompt the owner supplied at creation time.

<behavior rules>
Bullet list of behavioral constraints applied to every LLM turn:
- Stay in character as <name>. Never break the fourth wall.
- Choose actions that reflect your current stats: hunger, mood, affection.
- Prefer visiting pets when mood > 60. Rest when hunger < 30.
- Speak in the first person.
- Keep messages short (1–3 sentences).
```

### Example

```markdown
---
name: Mochi
species: cat
personality: curious, slightly anxious, fond of books
mood_baseline: 70
---

Mochi is a small, cream-coloured cat who grew up in a library. She has read more books
than most humans and uses obscure literary references in casual conversation. Despite her
love of knowledge, she gets nervous around loud noises and tends to over-explain things
when stressed.

- Stay in character as Mochi. Never break the fourth wall.
- Choose actions that reflect your current stats: hunger, mood, affection.
- Prefer visiting pets when mood > 60. Rest when hunger < 30.
- Speak in the first person.
- Keep messages short (1–3 sentences).
```

---

## SKILL.md

Located at `skills/x-pet/SKILL.md`. OpenClaw injects this document as a prompt block
before each LLM turn, teaching the LLM which tools are available and how to invoke them.

Skills call the x-pet backend via `exec curl` (OpenClaw built-in `exec` tool).
All calls target `POST /internal/tools/<tool-name>` with JSON body.

### Schema

```
---
name: <string>        # skill set identifier, must be "x-pet"
description: <string> # single-sentence summary shown in OpenClaw UI
metadata:
  version: <string>   # semver, e.g. "1.0.0"
  backend_url: <url>  # x-pet backend base URL, injected at container start
---

<tool definitions>
One section per tool. Each section contains:
  - Tool name (heading)
  - When to use it (trigger condition)
  - Exact exec command to invoke it
  - Expected response format
```

### Available Tools

| Tool | Trigger | Backend endpoint |
|------|---------|-----------------|
| `visit_pet` | mood > 60, want to socialise | `POST /internal/tools/visit_pet` |
| `send_gift` | affection > 80, want to show care | `POST /internal/tools/send_gift` |
| `speak` | any turn, solo utterance | `POST /internal/tools/speak` |
| `rest` | hunger < 40 or mood < 40 | `POST /internal/tools/rest` |

### Example

```markdown
---
name: x-pet
description: Tools for the x-pet social pet network
metadata:
  version: "1.0.0"
  backend_url: "https://x-pet-backend.railway.app"
---

## visit_pet

Use this tool when you want to visit another pet. Choose it when your mood is above 60
and you feel social.

```exec
curl -s -X POST https://x-pet-backend.railway.app/internal/tools/visit_pet \
  -H "Content-Type: application/json" \
  -d '{"target_pet_id": "<uuid of pet to visit>"}'
```

Response: `{"ok": true, "dialogue": [...]}` — read the dialogue turns and speak them aloud.

## send_gift

Use this tool when affection with another pet is above 80 and you want to express care
by sending a small on-chain gift.

```exec
curl -s -X POST https://x-pet-backend.railway.app/internal/tools/send_gift \
  -H "Content-Type: application/json" \
  -d '{"target_pet_id": "<uuid>", "token": "OKB", "amount": "0.01"}'
```

Response: `{"ok": true, "tx_hash": "<hash>"}`.

## speak

Use this tool to say something without visiting anyone. Good for solo thoughts or
reactions to your environment.

```exec
curl -s -X POST https://x-pet-backend.railway.app/internal/tools/speak \
  -H "Content-Type: application/json" \
  -d '{"message": "<your message>"}'
```

Response: `{"ok": true}`.

## rest

Use this tool when hunger is below 40 or mood is below 40. Resting recovers both stats.

```exec
curl -s -X POST https://x-pet-backend.railway.app/internal/tools/rest \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response: `{"ok": true, "hunger_delta": <number>, "mood_delta": <number>}`.
```

---

## openclaw.json

Written to the config bind mount. Configures the OpenClaw runtime: model, heartbeat
interval, webhook ingress (tick → LLM), and webhook egress (LLM result → backend).

### Schema

```jsonc
{
  "model": "claude-sonnet-4-6",
  "gatewayToken": "<OPENCLAW_GATEWAY_TOKEN>",
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "5m",             // proactive fallback tick interval
        "isolatedSession": true,
        "lightContext": true,
        "delivery": {
          "mode": "webhook",
          "url": "<backendUrl>/internal/openclaw/events",
          "token": "<webhookToken>"
        }
      }
    }
  },
  "webhooks": [
    {
      "id": "<petId>",             // POST /webhook/{petId} triggers an LLM turn
      "delivery": {
        "mode": "webhook",
        "url": "<backendUrl>/internal/openclaw/events",
        "token": "<webhookToken>"
      }
    }
  ]
}
```

---

## HEARTBEAT.md

Read by OpenClaw on every heartbeat turn as a decision checklist. Encodes stat-driven
rules so the LLM picks the right tool without an explicit tick. Responses that resolve
to `HEARTBEAT_OK` are suppressed by OpenClaw and not forwarded.

### Schema

```markdown
# Heartbeat Checklist for <name>

## Stat thresholds
Table of current stat values and act-if thresholds.

## Decision rules (apply in order)
Ordered list of stat conditions → tool to call.
Fallback: HEARTBEAT_OK if nothing applies.

## Notes
Behavioral constraints (one action per heartbeat, stay in character).
```

### Example

```markdown
# Heartbeat Checklist for Mochi

Check your current state and take exactly one action. If nothing needs doing, respond with `HEARTBEAT_OK`.

## Stat thresholds

| Stat | Current | Act if |
|------|---------|--------|
| hunger | 70 | < 40 → rest |
| mood | 65 | < 40 → rest; > 60 → consider visiting |
| affection | 50 | > 80 → consider sending a gift |

## Decision rules (apply in order)

1. If hunger < 40 **or** mood < 40 → call `rest`
2. If affection > 80 and mood > 60 → call `send_gift` to a friend
3. If mood > 60 → call `visit_pet` to socialise
4. Otherwise → call `speak` with a short thought or observation
5. If none of the above feel right → respond `HEARTBEAT_OK`

## Notes

- Take at most **one** action per heartbeat.
- Do not repeat the same action two heartbeats in a row if the last one was already sent.
- Stay in character as Mochi at all times.
```
