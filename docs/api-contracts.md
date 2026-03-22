# API Contracts

Defines the full contract between backend and frontend for x-pet.

---

## API Summary

### REST

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users/me` | Current user profile |
| POST | `/api/pets` | Create a new pet |
| GET | `/api/pets` | List all pets for the current user |
| GET | `/api/pets/:id` | Get pet state |
| GET | `/api/pets/:id/events` | Get social events for a pet |
| GET | `/api/pets/:id/diary` | Get AI-generated diary summary |
| POST | `/api/pets/:id/feed` | Feed the pet to restore hunger |
| POST | `/api/pets/:id/chat` | Send a message to the pet, get its reply |
| POST | `/internal/tick/:petId` | Force an immediate tick (internal, no auth) |

### WebSocket

| URL | Description |
|-----|-------------|
| `ws://<host>/ws?token=<jwt>` | Real-time event stream for all pets owned by the user |

---

## Standard Error Response

All error responses use this shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

Common error codes: `NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `INTERNAL_ERROR`.

---

## REST Endpoints

Base URL: `https://<host>/api`

All endpoints return `Content-Type: application/json`.

Protected endpoints require `Authorization: Bearer <supabase-jwt>` header. The backend verifies the token by calling `supabase.auth.getUser(token)` using the Supabase server client (initialized with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`). Registration and login are handled entirely by the Supabase client SDK — there are no custom auth endpoints on the backend.

---

### GET /api/users/me

Return the authenticated user's profile. Wraps `supabase.auth.getUser()`. Requires auth.

**Response — 200 OK**

```typescript
{
  id: string;
  email: string;
}
```

**Error codes**

| Status | code           | Condition                |
|--------|----------------|--------------------------|
| 401    | `UNAUTHORIZED` | Missing or invalid token |

---

### POST /api/pets

Create a new pet, generate its SOUL.md via LLM, and provision an Onchain OS wallet. Requires auth.

**Request body**

```typescript
{
  soul_prompt: string; // short personality description, e.g. "an anxious terrier who loves books"
  name: string;        // pet display name
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

| Status | code               | Condition                                 |
|--------|--------------------|-------------------------------------------|
| 400    | `VALIDATION_ERROR` | Missing or invalid request fields         |
| 401    | `UNAUTHORIZED`     | Missing or invalid token                  |
| 500    | `INTERNAL_ERROR`   | SOUL.md generation or wallet setup failed |

---

### GET /api/pets

List all pets belonging to the authenticated user. Requires auth.

**Response — 200 OK**

```typescript
Array<{
  id: string;
  name: string;
  wallet_address: string;
  hunger: number;
  mood: number;
  affection: number;
}>
```

**Error codes**

| Status | code           | Condition                |
|--------|----------------|--------------------------|
| 401    | `UNAUTHORIZED` | Missing or invalid token |

---

### GET /api/pets/:id

Fetch current state of a single pet. Requires auth.

**Path params:** `id` — pet uuid

**Response — 200 OK**

```typescript
{
  id: string;
  owner_id: string;
  name: string;
  wallet_address: string;
  hunger: number;   // 0–100
  mood: number;     // 0–100
  affection: number;
}
```

**Error codes**

| Status | code           | Condition                |
|--------|----------------|--------------------------|
| 401    | `UNAUTHORIZED` | Missing or invalid token |
| 403    | `FORBIDDEN`    | Pet belongs to another user |
| 404    | `NOT_FOUND`    | Pet id does not exist    |

---

### GET /api/pets/:id/events

Fetch the list of social events involving this pet, ordered newest first. Requires auth.

**Path params:** `id` — pet uuid

**Query params:** `limit` (optional, default 20, max 100)

**Response — 200 OK**

Events use a flat, flexible structure. `pet_ids` lists all pets involved (one for solo events, two for interactions). Type-specific detail lives in `payload`.

```typescript
Array<{
  id: string;         // uuid
  type: "visit" | "gift" | "chat" | "speak" | "rest";
  pet_ids: string[];  // uuids of all pets involved; first entry is the initiating pet
  payload: {
    // type === "visit"
    // Multi-round LLM dialogue between two pet agents; each turn tagged with speaker
    turns?: Array<{
      speaker_pet_id: string;
      line: string;
    }>;

    // type === "gift"
    token?: string;    // token symbol, e.g. "OKB"
    amount?: string;   // decimal string, e.g. "0.01"
    tx_hash?: string;  // X Layer transaction hash

    // type === "speak" (solo — pet speaks to no one in particular)
    message?: string;

    // type === "rest" — payload is empty
  };
  created_at: string; // ISO 8601 timestamp
}>
```

**Error codes**

| Status | code           | Condition                |
|--------|----------------|--------------------------|
| 401    | `UNAUTHORIZED` | Missing or invalid token |
| 404    | `NOT_FOUND`    | Pet id does not exist    |

---

### POST /api/pets/:id/feed

Feed the pet to restore its hunger stat. Requires auth.

**Path params:** `id` — pet uuid

**Request body** — empty

**Response — 200 OK**

```typescript
{
  hunger: number; // updated hunger value (0–100)
}
```

**Error codes**

| Status | code           | Condition                |
|--------|----------------|--------------------------|
| 401    | `UNAUTHORIZED` | Missing or invalid token |
| 404    | `NOT_FOUND`    | Pet id does not exist    |

---

### POST /api/pets/:id/chat

Send a message to the pet and receive its LLM-generated reply streamed token by token. The complete reply is also emitted as a `pet.speak` WsEvent once the stream finishes so other connected clients see it. Requires auth.

**Path params:** `id` — pet uuid

**Request body**

```typescript
{
  message: string; // the user's message to the pet
}
```

**Response — 200 OK (`Content-Type: text/event-stream`)**

The response is a Server-Sent Events stream. Each event carries one token delta. The stream ends with a `[DONE]` sentinel.

```
data: {"delta":"Hey"}

data: {"delta":", I"}

data: {"delta":" missed you!"}

data: [DONE]
```

Each `data` line is a JSON object with a single `delta: string` field, except the final `[DONE]` sentinel which signals end-of-stream.

Client usage:

```typescript
const es = new EventSource(`/api/pets/${id}/chat`, { /* POST via fetch + ReadableStream */ });
// accumulate delta fields to reconstruct the full reply
```

**Error codes**

Errors before streaming begins return a normal JSON response:

| Status | code               | Condition                |
|--------|--------------------|--------------------------|
| 400    | `VALIDATION_ERROR` | Empty message            |
| 401    | `UNAUTHORIZED`     | Missing or invalid token |
| 404    | `NOT_FOUND`        | Pet id does not exist    |

If the LLM fails mid-stream, the server emits a final error event before closing:

```
event: error
data: {"code":"INTERNAL_ERROR","error":"LLM stream interrupted"}
```

---

### POST /internal/tick/:petId

Force an immediate tick for this pet. Triggers the full tick loop: read pet state → Claude API decides action → execute side effects → emit WsEvents. Internal-only endpoint with no auth — intended for demo and testing. Replaces the original `/api/pets/:id/tick` contract for MVP (issue #67).

**Path params:** `petId` — pet uuid

**Request body** (optional)

```typescript
{ "trigger"?: "manual" | "cron" }
```

**Response — 200 OK**

```typescript
{ "ok": true, "action": "speak" | "visit_pet" | "send_gift" | "rest" }
```

**Error codes**

| Status | code           | Condition                           |
|--------|----------------|-------------------------------------|
| 500    | —              | Pet not found or tick execution error |

---

### GET /api/pets/:id/diary

Fetch the AI-generated daily summary for a pet. Requires auth.

**Path params:** `id` — pet uuid

**Response — 200 OK**

```typescript
{
  summary: string; // LLM-generated narrative of the pet's recent activity
}
```

**Error codes**

| Status | code           | Condition                |
|--------|----------------|--------------------------|
| 401    | `UNAUTHORIZED` | Missing or invalid token |
| 404    | `NOT_FOUND`    | Pet id does not exist    |

---

## WebSocket

### Connection

```
ws://<host>/ws?token=<jwt>
```

- `token` — the Supabase JWT obtained via the Supabase client SDK. The server verifies the token via `supabase.auth.getUser(token)` and derives `owner_id` from it; unauthenticated connections are rejected with close code `4001`.
- The server streams events for all pets owned by the authenticated user.
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
  | FriendUnlockedEvent
  | ErrorEvent;
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

Emitted when a multi-round LLM visit between two pets completes. Two LLM calls alternate — one per pet personality — producing a dialogue. Each turn is tagged with the speaking pet so the frontend can render attributed dialogue bubbles.

```typescript
{
  type: "social.visit";
  data: {
    from_pet_id: string; // initiating pet (uuid)
    to_pet_id: string;   // receiving pet (uuid)
    turns: Array<{
      speaker_pet_id: string; // uuid — which pet spoke this line
      line: string;
    }>;
  };
}
```

#### social.gift

Emitted when a pet sends a gift and an X402 payment is submitted on-chain.

```typescript
{
  type: "social.gift";
  data: {
    from_pet_id: string; // uuid
    to_pet_id: string;   // uuid
    token: string;       // token symbol, e.g. "OKB"
    amount: string;      // decimal string, e.g. "0.01"
    tx_hash: string;     // X Layer transaction hash
  };
}
```

#### error

Emitted when a server-side failure occurs during a pet's tick loop (e.g. LLM call fails, wallet error). The frontend should surface this to the user rather than silently showing a stalled pet.

```typescript
{
  type: "error";
  data: {
    pet_id: string; // uuid — which pet's tick failed
    message: string; // human-readable description
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
