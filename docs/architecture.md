# Architecture

## Data Model

### Pet

```typescript
interface Pet {
  id: string                    // uuid
  owner_id: string              // user id
  name: string
  soul_md: string               // raw SOUL.md content
  wallet_address: string        // Onchain OS Agent Wallet address
  wallet_privkey_enc: string    // encrypted, never returned to client
  history: Message[]            // LLM conversation history, last N turns
  skills: Skill[]               // parsed from SKILL.md
  affection_map: Record<string, number>  // pet_id → affection score
  stats: {
    hunger: number              // 0-100, decrements over time
    mood: number                // 0-100
    social: number              // 0-100
  }
  created_at: string
  updated_at: string
}
```

### Social Event

```typescript
interface SocialEvent {
  id: string
  type: 'visit' | 'chat' | 'gift' | 'compensation' | 'friendship_unlocked'
  from_pet_id: string
  to_pet_id: string
  payload: object               // event-specific data
  tx_hash?: string              // X Layer transaction hash if payment involved
  created_at: string
}
```

### User

```typescript
interface User {
  id: string
  telegram_id?: string
  wallet_address: string        // user's own wallet (for top-up)
  friends: string[]             // user_ids, unlocked via pet affection
  created_at: string
}
```

---

## Pet Runtime Engine

### Execution Trigger

Two triggers:
1. **Scheduled tick** (every N minutes): hunger decay, mood update, autonomous social action
2. **Event trigger**: another pet visits → force response turn

### Execution Loop

```
trigger
  └─ load pet row
  └─ parse SOUL.md → system prompt
  └─ load SKILL.md → tool definitions
  └─ check wallet balance
       └─ if insufficient → set pet to "hungry/sleeping", skip LLM call
  └─ pre-deduct X402 payment (or simulate)
  └─ LLM call with history + system prompt + tools
  └─ handle tool calls
       ├─ swap_gift(token, amount, to_pet_id) → Onchain OS Swap
       ├─ visit_pet(pet_id) → create SocialEvent
       └─ send_message(to_pet_id, text) → create SocialEvent + WS push
  └─ append assistant message to history (cap at last 20 turns)
  └─ update pet stats
  └─ emit WebSocket event to owner
```

---

## SOUL.md Format

```markdown
---
name: Biscuit
personality: curious, slightly anxious, loves cats
catchphrase: "Did you just...? Oh. Okay."
spending_limit: 0.01  # max OKB per transaction (safety cap)
---

Biscuit is a small terrier who grew up in a library. She is deeply curious
about other animals but gets nervous in large groups. She speaks in short
sentences and often trails off. She is generous to friends but cautious
with strangers.
```

---

## API Contract (Backend → Frontend)

### REST endpoints

```
POST   /api/pets              create pet (name, soul_prompt)
GET    /api/pets/:id          get pet state
GET    /api/pets/:id/events   paginated social event log
POST   /api/pets/:id/topup    deposit OKB to pet wallet
```

### WebSocket events (server → client)

```typescript
type WsEvent =
  | { type: 'pet_state'; petId: string; stats: PetStats; message: string }
  | { type: 'social_event'; event: SocialEvent }
  | { type: 'payment'; txHash: string; amount: string; token: string }
  | { type: 'friendship_unlocked'; userId: string; friendId: string }
```

---

## Layering Model

Dependencies flow strictly in one direction:

```
types → db → services → runtime → api → frontend
```

- `types/` — shared TypeScript interfaces, no imports from other layers
- `db/` — Supabase queries only, no business logic
- `services/` — wallet, X402, Onchain OS integrations
- `runtime/` — pet execution engine, composes services
- `api/` — Express routes, thin controllers calling runtime
- `frontend/` — reads API/WS, renders via PixiJS + DOM

**No circular imports. No skipping layers.**

---

## Naming Conventions

- Files: `kebab-case.ts`
- Functions: `camelCase`
- DB tables: `snake_case`
- Constants: `SCREAMING_SNAKE_CASE`
- All logs: structured JSON with `{ level, msg, petId?, eventType?, ... }`

---

## File Size Limits

- Single function: < 50 lines
- Single file: < 300 lines
- If exceeded: extract to separate module, do not suppress the rule
