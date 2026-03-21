# API Contracts

Defines the full contract between backend and frontend for x-pet.

---

## REST Endpoints

Base URL: `https://<host>/api`

All endpoints return `Content-Type: application/json`.

### Standard Error Response

All error responses use this shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

Common error codes: `NOT_FOUND`, `VALIDATION_ERROR`, `INTERNAL_ERROR`.

---

### POST /api/pets

Create a new pet, generate its SOUL.md via LLM, and provision an Onchain OS wallet.

**Request body**

```typescript
{
  soul_prompt: string;  // short personality description, e.g. "an anxious terrier who loves books"
  name: string;         // pet display name
}
```

**Response — 201 Created**

```typescript
{
  id: string;             // uuid
  name: string;
  wallet_address: string; // Onchain OS agent wallet address
  hunger: number;         // 0–100
  mood: number;           // 0–100
  affection: number;      // social score, starts at 0
}
```

**Error codes**

| Status | code               | Condition                          |
|--------|--------------------|------------------------------------|
| 400    | `VALIDATION_ERROR` | Missing or invalid request fields  |
| 500    | `INTERNAL_ERROR`   | SOUL.md generation or wallet setup failed |

---

### GET /api/pets/:id

Fetch current state of a single pet.

**Path params:** `id` — pet uuid

**Response — 200 OK**

```typescript
{
  id: string;
  owner_id: string;
  name: string;
  wallet_address: string;
  hunger: number;       // 0–100
  mood: number;         // 0–100
  affection: number;
  last_tick_at: string; // ISO 8601 timestamp
}
```

**Error codes**

| Status | code        | Condition             |
|--------|-------------|-----------------------|
| 404    | `NOT_FOUND` | Pet id does not exist |

---

### GET /api/pets/:id/events

Fetch the list of social events involving this pet (as sender or recipient), ordered newest first.

**Path params:** `id` — pet uuid

**Query params:** `limit` (optional, default 20, max 100)

**Response — 200 OK**

```typescript
Array<{
  id: string;           // uuid
  from_pet_id: string;  // uuid
  to_pet_id: string;    // uuid
  type: "visit" | "gift" | "chat";
  payload: {
    // type === "visit" or "chat"
    dialogue?: string[];    // alternating lines from each pet

    // type === "gift"
    token?: string;         // token symbol, e.g. "OKB"
    amount?: string;        // decimal string, e.g. "0.01"
    tx_hash?: string;       // X Layer transaction hash
  };
  created_at: string;   // ISO 8601 timestamp
}>
```

**Error codes**

| Status | code        | Condition             |
|--------|-------------|-----------------------|
| 404    | `NOT_FOUND` | Pet id does not exist |

---

### GET /api/pets/:id/diary

Fetch the AI-generated daily summary for a pet.

**Path params:** `id` — pet uuid

**Response — 200 OK**

```typescript
{
  summary: string; // LLM-generated narrative of the pet's recent activity
}
```

**Error codes**

| Status | code        | Condition             |
|--------|-------------|-----------------------|
| 404    | `NOT_FOUND` | Pet id does not exist |

---

## WebSocket

### Connection

```
ws://<host>/ws?owner_id=<uuid>
```

- `owner_id` — the authenticated user's uuid; the server streams events for all pets owned by this user.
- The server sends JSON-encoded `WsEvent` messages (server → client only).
- The client does not send messages over this connection.

---

### WsEvent Discriminated Union

```typescript
type WsEvent =
  | PetStateEvent
  | PetSpeakEvent
  | SocialVisitEvent
  | SocialGiftEvent
  | FriendUnlockedEvent;
```

#### pet.state

Emitted after each tick loop completes; carries updated pet stats.

```typescript
{
  type: "pet.state";
  data: {
    pet_id: string;    // uuid — identifies which pet updated
    hunger: number;    // 0–100
    mood: number;      // 0–100
    affection: number;
  };
}
```

#### pet.speak

Emitted when a pet produces an autonomous spoken line.

```typescript
{
  type: "pet.speak";
  data: {
    pet_id: string;  // uuid
    message: string; // the spoken line
  };
}
```

#### social.visit

Emitted when one pet visits another and a dialogue exchange completes.

```typescript
{
  type: "social.visit";
  data: {
    from: string;      // from_pet_id (uuid)
    to: string;        // to_pet_id (uuid)
    dialogue: string[]; // alternating lines; even indexes = from pet, odd = to pet
  };
}
```

#### social.gift

Emitted when a pet sends a gift and an X402 payment is submitted on-chain.

```typescript
{
  type: "social.gift";
  data: {
    from: string;    // from_pet_id (uuid)
    to: string;      // to_pet_id (uuid)
    token: string;   // token symbol, e.g. "OKB"
    amount: string;  // decimal string, e.g. "0.01"
    tx_hash: string; // X Layer transaction hash
  };
}
```

#### friend.unlocked

Emitted when the affection threshold between two pets' owners is crossed.

```typescript
{
  type: "friend.unlocked";
  data: {
    pet_id: string;   // uuid — the pet whose owner is now a friend
    owner_id: string; // uuid — the new friend's owner id
  };
}
```
