# PRD: Kite Integration — Remaining Work
**Project**: MCube Stocks  
**Status**: Active — parent PRD partially shipped  
**Date**: 2026-05-28  
**Parent doc**: [kite-integration-prd.md](./kite-integration-prd.md)

---

## 1. Purpose

This document tracks **everything not yet built** from the Kite integration plan. Use it while testing the shipped features. When an item ships, move it to §2 (Shipped) and strike it from the sprint sections below.

---

## 2. Shipped (May 2026) — test these now

| Area | What works |
|------|------------|
| **Notifications** | Unread badge on bell, clickable inbox, mark all read, push deep-links + read sync |
| **User management** | Settings → Users: list / add / remove stocks-section accounts |
| **Kite OAuth** | Connect / Reconnect / Disconnect in Settings; daily token in Neon `kite_sessions` |
| **Kite banner** | Amber reconnect prompt when token missing or expired |
| **Portfolio** | Holdings + Positions (Kite) + Logged trades (manual signal log) |
| **Trade defaults** | Settings → default ₹ per trade (stored; qty logic defined in §3.2, used at Sprint 2) |
| **Kite cron** | 8:30 AM IST weekday push if token expired (`/api/cron/kite-remind`) |
| **Kite read APIs** | `/api/kite/holdings`, `/api/kite/positions`, `/api/kite/orders` (view only) |

### Testing checklist (while you validate)

- [ ] **Connect Kite** — Settings → Connect → Zerodha OAuth → green “Connected · today” pill
- [ ] **Portfolio Holdings** — shows your Kite holdings with P&L
- [ ] **Portfolio Positions** — shows intraday positions (empty outside market hours is OK)
- [ ] **Portfolio Logged** — existing “Log buy” from signals still works; set target/SL inline
- [ ] **Token expiry UX** — banner appears when token is stale (or disconnect and refresh)
- [ ] **Notifications** — bell shows unread count; tap row navigates; “Mark all read” works
- [ ] **Push click** — tap phone notification → opens correct page; read state syncs
- [ ] **Users** — add a test user, confirm login works, delete test user
- [ ] **Brother** — separate MCube login → his own Connect Kite → his holdings only
- [ ] **Cron** (optional) — hit `/api/cron/kite-remind` with `Authorization: Bearer $CRON_SECRET` when token expired

---

## 3. Remaining — Sprint 2: One-Click Trading (blocked on static IP)

**Goal:** Buy / Sell on signal cards → order goes to Kite. This is the only major feature left for Phase 1.

### 3.1 Prerequisite — Static IP + order relay

Kite rejects order API calls from unregistered IPs. Vercel alone cannot place orders.

**Recommended:** Railway Pro order relay (~$20/mo, static IP included).

```
Vercel /api/kite/order  →  Railway relay (fixed IP)  →  Kite placeOrder / cancelOrder
```

| Step | Owner | Action |
|------|-------|--------|
| 1 | Sanjay | Upgrade Railway Hobby → **Pro** when ready for live orders |
| 2 | Dev | Deploy `mcube-kite-relay` service (minimal Node app) |
| 3 | Sanjay | Railway service → Settings → **Enable Static IPs** → copy egress IP(s) |
| 4 | Sanjay | Kite Profile → IP Whitelist → add Railway IP(s) (max 2 slots) |
| 5 | Dev | Vercel env: `KITE_RELAY_URL`, `KITE_RELAY_SECRET` |

**Alternatives:** $6/mo VPS relay, QuotaGuard proxy (~$9–19/mo). See parent PRD §3.1.

**Not viable:** Home network (multi-ISP + load balancer), Vercel $100 Static IPs add-on.

### 3.2 Position sizing — confirmed (May 2026)

Settings **“Default Trade Size”** is a **target budget in ₹**, not an exact order value. Quantity is derived from live price (LTP on the signal card or Kite quote at click time).

#### Rule: floor to whole shares (never overspend budget)

```
rawQty   = defaultTradeAmount ÷ LTP
qty      = floor(rawQty)                    // whole shares only
actual₹  = qty × LTP                        // usually slightly under budget
```

**Examples:**

| Stock | LTP | Budget | Qty | Actual ₹ |
|-------|-----|--------|-----|----------|
| NTPC | ₹350 | ₹10,000 | 28 | ≈ ₹9,800 |
| RELIANCE | ₹1,400 | ₹10,000 | 7 | ≈ ₹9,800 |

Exact ₹10,000 is not possible with whole shares — that is expected.

#### Lot size (NSE delivery / CNC)

- Default product: **CNC** (delivery), exchange **NSE**.
- Almost all NSE equity symbols have **lot size = 1 share**.
- If lot size &gt; 1 (rare for our universe):

```
qty = floor(defaultTradeAmount ÷ LTP ÷ lotSize) × lotSize
```

Lot size comes from Kite instruments lookup when building the order (cache per symbol).

#### Minimum quantity

| Case | Behaviour |
|------|-----------|
| `floor(budget ÷ LTP) ≥ 1` | Use that qty |
| `floor(budget ÷ LTP) < 1` | **Disable Buy** — stock too expensive for budget; tooltip: “Increase trade size in Settings” |
| User sets qty to 0 | Block order |

#### UX on signal card (floor + editable qty) — **confirmed**

| Element | Behaviour |
|---------|-----------|
| **Qty input** | Pre-filled from formula above; user can edit before Buy |
| **Preview label** | `Buy · 28 qty · ≈₹9,800` (recalculates when qty or LTP changes) |
| **Buy click** | Sends user’s qty (default or edited) to `/api/kite/order` |
| **Post-order toast** | Shows Kite’s actual filled value: `Order placed · ₹9,812 · [Cancel]` |
| **Sell** | Pre-fill **full holding qty** for that symbol (editable) |

No confirmation dialog before order (speed over safety).

#### Settings copy (update at Sprint 2)

Replace vague “Phase 2” text with:

> *Target ₹ per buy. Quantity is calculated from live price, rounded **down** to whole shares. You can adjust qty on each signal before buying.*

#### Shared helper (implement at Sprint 2)

```typescript
// lib/stocks/order-qty.ts
export function calculateOrderQty(
  budgetInr: number,
  ltp: number,
  lotSize = 1
): { qty: number; estimatedInr: number } | null {
  if (ltp <= 0 || budgetInr < ltp) return null;
  const raw = Math.floor(budgetInr / ltp);
  const qty = Math.floor(raw / lotSize) * lotSize;
  if (qty < 1) return null;
  return { qty, estimatedInr: qty * ltp };
}
```

Server re-validates qty on `/api/kite/order` (never trust client-only math).

#### Phase 2 automation

Auto-execute uses the **same** `calculateOrderQty(defaultTradeAmount, signalLtp)` — no separate sizing logic.

---

### 3.3 Decisions needed before build

| # | Decision | Options | Status |
|---|----------|---------|--------|
| 1 | Exchange | NSE only / per-stock | **Default NSE** — confirm |
| 2 | Order type | MARKET / LIMIT at signal price | **Default MARKET** — confirm |
| 3 | Position sizing | Fixed ₹ / fixed qty / % capital | **✅ Fixed ₹ + floor + editable qty** (§3.2) |
| 4 | Relay host | Railway Pro / VPS / other | **Default Railway Pro** — confirm when ready |

### 3.4 DB — Neon `kite_trades` table

Log every Kite order placed from MCube (separate from MongoDB `UserTrade` manual log):

```sql
CREATE TABLE kite_trades (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL,
  signal_ref    TEXT,                -- optional link to signal
  symbol        TEXT NOT NULL,
  exchange      TEXT NOT NULL,       -- NSE
  kite_order_id TEXT,
  order_type    TEXT NOT NULL,       -- BUY / SELL
  qty           INTEGER NOT NULL,
  price         NUMERIC(10,2),       -- filled price (async update)
  target_price  NUMERIC(10,2),
  stop_loss     NUMERIC(10,2),
  status        TEXT DEFAULT 'OPEN', -- OPEN / CLOSED / CANCELLED
  strategy      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  closed_at     TIMESTAMPTZ
);
```

### 3.5 API routes to build

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/kite/order` | POST | Place order via relay → log to `kite_trades` |
| `/api/kite/order/:id/cancel` | POST | Cancel within 5s window |
| *(relay)* `/order` | POST | Railway service — calls Kite SDK from static IP |
| *(relay)* `/cancel` | POST | Railway service — cancel order |

**Relay contract (draft):**
```json
POST /order
Headers: { "X-Relay-Secret": "..." }
Body: {
  "accessToken": "...",
  "symbol": "RELIANCE",
  "exchange": "NSE",
  "transactionType": "BUY",
  "orderType": "MARKET",
  "quantity": 10,
  "product": "CNC"
}
```

### 3.6 UI — Signal cards

| Change | File | Details |
|--------|------|---------|
| **Buy** button | `unified-signal-card.tsx` | Only if Kite connected + token valid + `calculateOrderQty` returns qty ≥ 1 |
| **Sell** button | same | Only if user holds stock (cross-ref Kite holdings); qty = holding qty |
| **Qty input** | same | Pre-filled via §3.2; editable before Buy/Sell |
| **Preview label** | same | `Buy · {qty} qty · ≈₹{estimatedInr}` — updates on qty/LTP change |
| Holding badge | same | “You hold {n}” if in Kite holdings |
| Order toast | new component | `Order placed · ₹{actual} · [Cancel]` — 5s window; actual from Kite response |
| Disable state | same | Grey out Buy if Kite disconnected, token expired, or stock too expensive for budget |
| Settings helper text | `trade-settings-card.tsx` | Update copy per §3.2 |

**Out of scope for Sprint 2:** Confirmation dialog before order (speed over safety per original PRD).

### 3.7 Portfolio additions (post-trading)

| Change | Details |
|--------|---------|
| **Kite Orders** tab or section | Today’s orders from `/api/kite/orders` |
| **Kite Trades** tab | Read from `kite_trades` table; link to strategy signal |
| Sell from Holdings row | Pre-filled qty — calls same order API |

### 3.8 Sprint 2 implementation order

1. Pick static IP approach + whitelist in Kite
2. Deploy order relay on Railway Pro
3. Create `kite_trades` table in Neon
4. Add `lib/stocks/order-qty.ts` + server-side qty validation on order API
5. Build relay + Vercel `/api/kite/order` + cancel
6. Buy/Sell on signal cards — qty input, preview label, 5s cancel toast
7. Update Settings trade-size helper text
8. Smoke test with **1 share** live order in market hours; then test ₹10k budget sizing on a mid-cap name

---

## 4. Remaining — Polish & gaps (no static IP blocker)

Small improvements discovered during testing or deferred from Phase 1.

| # | Item | Priority | Notes |
|---|------|----------|-------|
| P1 | **Kite orders in Portfolio** | Medium | `/api/kite/orders` exists — add UI tab for today’s Kite order book |
| P2 | **Merge trade logs** | Low | “Logged” (manual) vs `kite_trades` (auto) — unified view or clear labels |
| P3 | **Live quotes on portfolio** | Low | Personal Kite plan has no WebSocket; LTP comes from holdings API or Yahoo fallback |
| P4 | **Sell from Holdings row** | Medium | Blocked until Sprint 2 order API exists |
| P5 | **Notification history limit** | Low | Confirm 20 is enough; add “Load more” if not |
| P6 | **User mgmt: restrict to owner** | Low | If you decide only one account should add/remove users |
| P7 | **Kite postback URL** | Low | Optional order fill webhooks — skip unless you need async fill prices |
| P8 | **Error handling UX** | Medium | Friendly messages for Kite API errors (insufficient margin, market closed, etc.) |
| P9 | **Local dev OAuth** | Low | Redirect URL for `localhost` in Kite console for local Connect testing |

---

## 5. Remaining — Phase 2: Automated Trading (after manual testing)

**Do not start until Sprint 2 has been used live for several weeks.**

| # | Feature | Details |
|---|---------|---------|
| 1 | Auto-execute toggle | Settings → OFF by default |
| 2 | Signal execution cron | Every 5–10 min, 9:15–15:30 IST weekdays |
| 3 | Per-user automation flag | Store in MongoDB `stocks_user_settings` |
| 4 | Order on new signals | Only for users with auto-execute ON + valid Kite token; qty via §3.2 |
| 5 | Push per auto-order | “Auto-bought RELIANCE · EMA pullback” |
| 6 | Kill switch | Settings → “Pause all automation” — instant off |
| 7 | Rate limit safety | Max 10 orders/sec per Kite client ID — batch carefully |

Same order relay and static IP as Sprint 2; only the **trigger** changes (cron vs human click).

---

## 6. Env vars — full list when complete

```bash
# Existing
MONGODB_URI=
DATABASE_URL=
AUTH_SECRET=
VAPID_SUBJECT=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
CRON_SECRET=

# Kite (shipped)
KITE_API_KEY=
KITE_API_SECRET=

# Sprint 2 (remaining)
KITE_RELAY_URL=https://mcube-kite-relay.up.railway.app
KITE_RELAY_SECRET=generate-a-long-random-string
```

---

## 7. Open questions (carry forward)

| # | Question | Status |
|---|----------|--------|
| 1 | NSE only? | **Unanswered** — default NSE |
| 2 | MARKET or LIMIT orders? | **Unanswered** — default MARKET |
| 3 | Position sizing / qty math | **✅ Decided** — floor to whole shares + editable qty (§3.2) |
| 4 | Default ₹ per trade | Settings default ₹10,000; each user can change in Settings |
| 5 | Both users manage users? | **Unanswered** — currently both can |
| 6 | Railway Pro upgrade timing | When you finish testing Sprint 0–1 + portfolio |
| 7 | Upgrade to Kite Connect ₹500/mo? | Only if live WebSocket quotes needed on portfolio |

---

## 8. Definition of done — Phase 1 complete

Phase 1 is **done** when:

- [ ] Sprint 2 Buy/Sell works in production with relay + whitelisted IP
- [ ] Both users can connect Kite and see their own portfolio
- [ ] At least one real trade placed successfully from a signal card
- [ ] Cancel-within-5s tested once
- [ ] Kite reconnect cron verified on a weekday morning
- [ ] No P0 bugs in notifications, OAuth, or portfolio sync

Phase 2 (automation) is a **separate milestone** after trust is established.

---

## 9. Suggested timeline

| When | Work |
|------|------|
| **Now** | You test §2 checklist; log bugs |
| **After testing OK** | Decide §3.2 trading options + upgrade Railway Pro |
| **~1 dev sprint** | Sprint 2 — relay + Buy/Sell |
| **2–4 weeks live** | Manual one-click trading only |
| **Later** | Phase 2 automation (§5) |

---

*End of remaining-work PRD*
