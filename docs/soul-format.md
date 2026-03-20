# SOUL.md / SKILL.md Format Reference

This project implements a multi-tenant runtime compatible with the OpenClaw SOUL.md/SKILL.md format convention.

## SOUL.md

Each pet has exactly one SOUL.md stored in the database (not as a file).

### Format

```markdown
---
name: <pet name>
personality: <comma-separated traits>
catchphrase: <optional, one short line>
spending_limit: <max OKB per single transaction, e.g. 0.01>
language: <default: en>
---

<Free-form prose describing the pet's backstory, behavioral tendencies,
quirks, how it speaks, what it values, what makes it nervous or excited.
2-4 paragraphs. This becomes the LLM system prompt prefix.>
```

### Parsing

- Frontmatter: YAML (use `js-yaml` or `gray-matter`)
- Body: passed verbatim as system prompt content after frontmatter fields are extracted
- `spending_limit` is enforced at the runtime level before any payment tool call — the LLM cannot override it

### Generation

When a user provides a soul sentence (e.g., "an anxious terrier who loves books"), the backend calls the LLM to expand it into full SOUL.md format. Prompt template lives in `packages/backend/src/prompts/generate-soul.ts`.

---

## SKILL.md

Skills are tools the pet can invoke during its execution turn.

### Format

```markdown
---
name: swap_gift
description: Send a token gift to another pet's wallet on X Layer
---

## Parameters
- `to_pet_id` (string, required): the recipient pet's ID
- `token` (string, required): token symbol, e.g. "OKB" or "USDT"
- `amount` (number, required): amount to send, must be <= spending_limit

## Behavior
Calls the Onchain OS Swap API to transfer tokens from this pet's wallet
to the recipient pet's wallet. Emits a SocialEvent of type "gift".
```

### Built-in Skills (MVP)

| Skill | Trigger | Implementation |
|-------|---------|----------------|
| `visit_pet` | autonomous tick | creates SocialEvent, fetches target pet for dialogue |
| `send_message` | during visit | creates SocialEvent, pushes via WebSocket |
| `swap_gift` | high affection event | calls Onchain OS Swap or direct ERC-20 transfer |
| `update_diary` | end of tick | LLM summarizes day, stored as `diary_entry` |

### Tool Call Routing

The runtime parses each SKILL.md into an LLM tool definition (JSON Schema format) and registers it before the LLM call. When the LLM returns a tool call, the router dispatches to the corresponding handler in `packages/backend/src/skills/`.

---

## Compatibility Note

The original OpenClaw runtime is a single-user desktop process that reads SOUL.md and SKILL.md from the filesystem. This implementation stores the same format as database columns and executes the equivalent runtime logic in a multi-tenant Node.js service. The SOUL.md/SKILL.md text formats are identical.
