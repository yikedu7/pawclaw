# MVP Spec — XLayer Hackathon

## Hackathon Context

- **Event:** XLayer Hackathon (OKX ecosystem)
- **Judging criteria (inferred):** On-chain integration depth, Onchain OS usage, X402 payment, product novelty, demo quality
- **Pitch angle:** "We're not building a Web3 QQ pet — we're exploring the economic form of the next digital life using OKX Onchain OS"

---

## Demo Script (5 minutes)

### Step 1: Pet Creation (60s)
- User logs in (email/wallet)
- Types one "soul sentence" (e.g., "an anxious terrier who loves books")
- App generates full personality via LLM → populates SOUL.md
- **Onchain OS creates an Agent Wallet** for the pet — show wallet address generated
- Pet appears in their room

### Step 2: Pet Is Alive (60s)
- Room view: hunger bar / mood / social score
- Pet speaks one autonomous line: "Today I met a golden retriever and got nervous"
- Show "today's diary" summary (AI-generated)
- Emphasize: this pet exists independently, not just when you're watching

### Step 3: Autonomous Social Event (90s)
- Click "wait 10 seconds" (speed up demo time)
- Pet auto-visits another pet (pre-seeded demo pet named "Mochi")
- Show dual-pet dialogue: two LLM calls, alternating messages
- Affection event fires: "Biscuit gave Mochi a virtual bone"

### Step 4: X402 Payment Magic (60s)
- The gift triggers an X402 payment: pet wallet → Mochi's wallet
- Show terminal/log: `402 → wallet signs → tx submitted → X Layer confirms`
- Show on-chain tx hash (X Layer explorer link)
- **This is the money shot. Slow down here.**

### Step 5: Outcome (30s)
- Affection threshold crossed → "You and Mochi's owner are now friends"
- Show social graph update
- Show pet's asset inventory: received the bone NFT / token
- Recap: "The pet earned social capital on-chain, autonomously, paid for itself"

---

## Feature Checklist

### Must-have (P0)
- [ ] User registration (email or wallet connect)
- [ ] Pet creation: soul prompt → SOUL.md generation → Onchain OS wallet
- [ ] Pet room view: stats display, one autonomous message per visit
- [ ] Social event: pet-to-pet visit + LLM dialogue
- [ ] X402 payment on gift event (real or well-simulated)
- [ ] X Layer transaction: gift token transfer between pet wallets
- [ ] Diary: AI-generated daily summary
- [ ] Demo stability: 2 pre-seeded pets for reliable demo flow

### Should-have (P1)
- [ ] Telegram bot notification to pet owner
- [ ] Social graph / friend list UI
- [ ] Pet hunger decay + top-up flow (show economic loop)
- [ ] On-chain tx history panel

### Nice-to-have (P2, skip if time-constrained)
- [ ] Onchain OS Swap skill (token swap as gift)
- [ ] Multiple pet templates / avatar selection
- [ ] Pet-to-pet affection history timeline

---

## What We Are NOT Building

- NFT minting
- Complex matchmaking algorithm
- AR features
- User-uploaded assets
- Multi-chain support
- Anything requiring Apple/Google app store

---

## Fallback Plans

| Scenario | Fallback |
|---------|----------|
| X402 LLM endpoint not available | Simulate 402 handshake in middleware, use regular API key |
| Onchain OS API blockers | Use direct Ethereum wallet (ethers.js), stub Onchain OS calls |
| X Layer RPC issues | Use Sepolia testnet as backup |
| Demo pet dialogue is slow | Pre-record one interaction, replay for judges |

---

## Issue-Driven Development Plan

Create these GitHub issues (in order of P0 priority):

1. **[P0] Project scaffold: monorepo, TypeScript, DB schema** (backend/packages setup)
2. **[P0] Pet creation API + SOUL.md generation** (POST /api/pets)
3. **[P0] Onchain OS wallet generation** (Agent Wallet per pet)
4. **[P0] Pet runtime engine: scheduled tick + LLM execution loop**
5. **[P0] Social event engine: pet visits, dual-pet dialogue**
6. **[P0] X402 payment integration** (gift event → wallet → chain)
7. **[P0] Frontend: pet room view** (PixiJS canvas + stats DOM)
8. **[P0] Frontend: WebSocket integration** (live event stream)
9. **[P1] Telegram bot notifications**
10. **[P1] Social graph / friend panel**
11. **[P1] Demo seeding script** (2 pre-provisioned pets)
