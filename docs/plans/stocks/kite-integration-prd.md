# PRD: Kite Connect Integration & Trading Dashboard
**Project**: MCube Stocks — mcubetechstudio.com/stocks  
**Authors**: Sanjay + Brother  
**Date**: 2026-05-28  
**Status**: Draft — Phase 1 partially shipped (see [remaining work PRD](./kite-integration-remaining-prd.md))

---

## 1. Context & Scope

The existing app at `mcubetechstudio.com/stocks` already has:
- Username/password auth (better-auth) with a `section: "stocks"` gate
- Scanner-generated signals (breakout, EMA pullback, VCP, etc.)
- A basic portfolio page
- Push notifications infrastructure

This PRD covers everything needed to go from "signal viewer" to "connected trading dashboard" — Kite OAuth, one-click order placement, portfolio synced from Kite, and a path to full automation.

**What is NOT changing:**
- The `/stocks` route stays. No subdomain.
- Existing better-auth (username/password) stays as the app login.
- Your brother's Python scanner stays untouched — he owns signal generation.
- Next.js API routes (your side) handle all Kite operations.

**Additional scope (added 2026-05-28):**
- Lightweight **user management** inside `/stocks/settings` (add/remove stocks-section users without running seed scripts).
- **Notification center overhaul** — working clicks, read/unread state, unread count badge on the bell (replacing the green dot).

---

## 2. Users

| User | Role | Kite Account |
|------|------|--------------|
| Sanjay | You | Personal Kite account |
| Brother | ML/Backend | His own Kite account |

Two users, each logs into the app with their credentials, each connects their own Kite account via OAuth. One shared Kite Connect app (one `api_key` / `api_secret` pair in env vars). Each user gets their own `access_token` after OAuth.

---

## 3. Feature Breakdown

### 3.1 Kite Connect Setup (One-time)

#### Plans (updated May 2026)

| Plan | Cost | Good for MCube? |
|------|------|-----------------|
| **Personal (Free)** | ₹0 | **Yes for Phase 1** — OAuth, place/cancel orders, holdings, positions, funds |
| **Connect (Paid)** | ₹500/month per API key | Only if you need **live WebSocket quotes** or **historical candle data** from Kite |

Personal does **not** include live market data or historical candles. Signal prices come from your scanner; portfolio LTP can use scanner data or you upgrade later.

Official docs: [Zerodha Kite Connect FAQ](https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/kite-connect-api-faqs) · [Sign up guide](https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/how-do-i-sign-up-for-kite-connect)

#### One app, one key pair — both users share it

**Sanjay creates the developer app once.** Your brother does **not** need his own `api_key` / `api_secret` or separate Vercel env vars.

| Credential | Where it lives | Who uses it |
|------------|----------------|-------------|
| `KITE_API_KEY` + `KITE_API_SECRET` | Vercel env (one pair) | Server only — OAuth + API calls for **all** users |
| Daily `access_token` | `kite_sessions` table, per `user_id` | Each user gets their own after clicking "Connect Kite" with **their** Zerodha login |

Flow: same app credentials → Sanjay OAuth → his token in DB; Brother OAuth → his token in DB. Orders run against whoever is logged into MCube.

#### Generate API key & secret

1. Sign up at [developers.kite.trade/signup](https://developers.kite.trade/signup) (use desktop browser).
2. Choose **Personal (Free)** unless you need live Kite quotes.
3. **My Apps** → **Create New App**:
   - **App Name:** e.g. `MCube Stocks`
   - **Zerodha Client ID:** your client ID (e.g. `AB1234`)
   - **Redirect URL:** `https://mcubetechstudio.com/api/kite/callback`
   - **Postback URL:** optional — skip for now
4. Copy **API Key** and **API Secret** immediately (secret may only show once).
5. Add to Vercel → Project → **Settings** → **Environment Variables**:
   ```
   KITE_API_KEY=...
   KITE_API_SECRET=...
   ```
   Apply to Production (and Preview if testing). Redeploy after adding.

Also add the same vars to `.env.local` for local dev. Never commit secrets to git.

#### Static IP — required for order placement (SEBI rule, live since Apr 2025)

Kite **rejects order API calls** from unregistered IPs. OAuth, holdings, positions, and status work from **any** IP — **only order place/cancel** need whitelisting.

Vercel’s native Static IPs add-on costs **~$100/month per project** on top of Pro — **not recommended for MCube**. Use one of the cheaper options below instead.

##### Option A — Order relay on a tiny VPS (**recommended**, ~$5–6/mo)

Keep MCube on Vercel ($20 Pro). Run a **minimal order relay** on a cheap VPS with a included static IP:

| Provider | Example cost | Notes |
|----------|--------------|-------|
| DigitalOcean Droplet (Bangalore) | ~$6/mo | Static IPv4 included |
| AWS Lightsail (Mumbai) | ~$5/mo | Static IP included |
| Hetzner / Contabo | ~€4–5/mo | EU DC — higher latency to Kite |

**Architecture:**
```
Vercel (UI + OAuth + holdings + portfolio)
  └── POST /api/kite/order  →  forwards to  →  VPS order relay (static IP)
                                                    └── Kite placeOrder / cancelOrder
```

- VPS exposes one HTTPS endpoint (e.g. `https://kite-relay.yourdomain.com/order`).
- Vercel sends `{ access_token, order params }` + shared secret header (`KITE_RELAY_SECRET`).
- Relay calls Kite from the VPS static IP.
- Whitelist **only the VPS IP** in Kite Profile → IP Whitelist.

**Pros:** Cheapest reliable setup; full control; ~$6/mo total extra.  
**Cons:** One small service to maintain (can be a 50-line Node/Python app).

##### Option B — Egress proxy on Vercel (~$9–19/mo)

Services like [QuotaGuard Shield](https://www.quotaguard.com/) give a fixed outbound IP. Configure **only** the Kite order HTTP client in Vercel to route through the proxy (`HTTPS_PROXY` env var). Whitelist the proxy IP in Kite.

**Pros:** No VPS to manage; stays 100% on Vercel.  
**Cons:** Monthly proxy fee; slightly more latency; proxy config in code.

##### Option C — Fly.io static egress (~$4–5/mo compute + $3.60/mo per IPv4)

Host a tiny Fly.io app (order relay only) with [app-scoped egress IP](https://fly.io/docs/networking/egress-ips/) ($3.60/mo per IPv4). Vercel calls Fly internally. Whitelist Fly egress IP(s) in Kite.

**Pros:** Cheaper than Vercel Static IPs; managed platform.  
**Cons:** Second platform to deploy; Fly + Vercel wiring.

##### Option D — Brother’s existing server (free if available)

If your brother already runs the Python scanner on a machine with a **fixed public IP** (home ISP static IP or cloud VM), the order relay can live there. Same relay pattern as Option A.

**Pros:** $0 extra if server already exists.  
**Cons:** Depends on his infra uptime; couples trading to scanner host.

##### Option E — Vercel Static IPs (~$100/mo)

Native add-on: Project → Settings → Connectivity → enable Static IPs → whitelist both egress IPs in Kite. Simplest ops, highest cost — **skip** (user on $20 Pro, not worth it).

##### Option F — Railway Pro order relay (~$20/mo) — **likely choice**

User already has Railway Hobby ($5). **Static outbound IPs require Railway Pro ($20/mo)** — included at no extra charge per service.

1. Upgrade Railway workspace to Pro when Sprint 2 starts.
2. Deploy `mcube-kite-relay` service → Settings → **Enable Static IPs**.
3. Whitelist 1–2 Railway egress IPs in Kite (Kite allows max 2 slots; avoid HA mode if it assigns 3).
4. Vercel calls relay via `KITE_RELAY_URL` + `KITE_RELAY_SECRET`.

**Pros:** Already on Railway; static IP included in Pro; no $100 Vercel add-on.  
**Cons:** +$15/mo vs current Hobby plan; second deploy target.

##### Not viable — home / local network

- Home broadband IPs are **dynamic** (change on reboot) — Kite whitelist allows only **one update per week**.
- Multi-ISP + load balancer at home makes egress IP unpredictable.
- Local PC is not in the Vercel production path unless exposed 24/7 via tunnel.
- **Use home IP only for local dev testing**, not production orders.

---

**Decision status (May 2026):** Static IP approach **deferred until Sprint 2** (one-click trading). Sprint 0 + Sprint 1 proceed on Vercel with no static IP.

**What you can ship without static IP (do this now):**
- Kite OAuth (Connect / Reconnect)
- Holdings & positions sync
- Portfolio dashboard (read-only from Kite)
- Token-expired banners & daily reconnect push

**What needs static IP before go-live:**
- Buy / Sell one-click buttons
- Order cancel within 5s window
- Phase 2 auto-execute

**PRD implementation default:** Option F (Railway Pro relay) when Sprint 2 starts — revisit VPS (Option A) if Railway upgrade isn’t wanted.

**Kite whitelist (when ready for Sprint 2):**
1. [developers.kite.trade](https://developers.kite.trade) → **Profile** → **IP Whitelist**
2. Add primary (+ optional secondary) IP from your chosen option
3. Save — one change allowed per calendar week

#### Pre-dev checklist

- [ ] Developer account + **Personal (Free)** app created
- [ ] Redirect URL set to `https://mcubetechstudio.com/api/kite/callback`
- [ ] `KITE_API_KEY` + `KITE_API_SECRET` in Vercel (+ `.env.local`)
- [ ] Static IP strategy chosen (A/B/C/D) — relay can wait until Sprint 2 (trading)
- [ ] Whitelist relay/proxy IP in Kite Profile before testing live orders
- [ ] Redeploy after env changes

---

### 3.2 Auth: No Changes + Small Extension

The existing two user accounts stay exactly as-is. The only addition is storing each user's Kite `access_token` (and its expiry) against their user ID.

**DB addition — Neon Postgres:**
```sql
CREATE TABLE kite_sessions (
  user_id       TEXT PRIMARY KEY,   -- matches better-auth user id
  access_token  TEXT NOT NULL,
  token_date    DATE NOT NULL,       -- date token was issued (expires next day 6am)
  connected_at  TIMESTAMPTZ DEFAULT now()
);
```

No new login page. No new auth flow. Just a "Connect Kite" button in Settings.

---

### 3.3 Kite OAuth Flow (Connect / Reconnect)

**Every day, once:**

```
User clicks "Connect Kite" in Settings
  → GET /api/kite/login
    → Redirect to: https://kite.trade/connect/login?api_key=XXX&v=3
      → User logs into Kite
        → Kite redirects to /api/kite/callback?request_token=YYY&status=success
          → Server: exchange request_token for access_token
            → Store in kite_sessions for this user
              → Redirect to /stocks (or /stocks/portfolio)
```

**API routes:**
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/kite/login` | GET | Generate Kite login URL, redirect user |
| `/api/kite/callback` | GET | Receive `request_token`, exchange for `access_token`, store it, redirect |
| `/api/kite/status` | GET | Is this user's token valid? Returns `{ connected: bool, expired: bool }` |
| `/api/kite/disconnect` | POST | Delete user's token from DB |

**Token expiry rule:** Kite tokens expire at ~6:00 AM IST daily. A token is considered expired if `token_date < today` (IST). Check this on every Kite API call.

---

### 3.4 Daily Reconnect Notification (8:30 AM IST)

You already have push notifications wired up. Add a Vercel Cron job:

**`vercel.json` cron:**
```json
{
  "crons": [
    { "path": "/api/cron/kite-remind", "schedule": "0 3 * * 1-5" }
  ]
}
```
`0 3 * * 1-5` = 3:00 AM UTC = 8:30 AM IST, weekdays only.

**`/api/cron/kite-remind` logic:**
1. Fetch all users with push subscriptions
2. Check `kite_sessions` — is today's token missing for any of them?
3. If expired/missing → send push: *"Market opens in 30 min. Tap to reconnect your Kite account."*
4. Deep-link the notification to `/stocks/settings`

**Settings page UX:**
- Green pill: "Kite connected · refreshed today"
- Yellow pill + button: "Token expired — Reconnect Kite"
- This banner also appears at top of the main `/stocks` page if token is missing

---

### 3.5 One-Click Trading (Phase 1 — Ship First)

This is the core Phase 1 feature. Every signal card gets a **Buy** button. You click it, the order goes to Kite. No confirmation dialog for speed; but there's a cancel window.

#### Order placement flow:
```
User clicks [Buy] on a signal card
  → POST /api/kite/order
    Body: { symbol, exchange, qty, orderType: "MARKET" | "LIMIT", price? }
  → Server calls KiteConnect.placeOrder(...)
  → Returns { orderId, status }
  → UI shows: green toast "Order placed · ₹XXXX · [Cancel]" (5 sec window)
    → Cancel within 5s → POST /api/kite/order/:id/cancel
    → After 5s → toast closes, order is live
```

#### Signal card additions:
- `[Buy]` button — places a MARKET BUY at current price
- `[Sell]` button — visible only if you hold that stock (cross-reference holdings)
- Quantity input (pre-fill with a default from Settings: e.g. "₹10,000 per trade")
- Small badge on card if you already hold the stock

#### New DB table — `trades` (Neon Postgres):
```sql
CREATE TABLE trades (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL,
  signal_id    INTEGER,             -- FK to signal that triggered the trade
  symbol       TEXT NOT NULL,
  exchange     TEXT NOT NULL,       -- NSE / BSE
  kite_order_id TEXT,
  order_type   TEXT NOT NULL,       -- BUY / SELL
  qty          INTEGER NOT NULL,
  price        NUMERIC(10,2),       -- actual executed price (filled async)
  target_price NUMERIC(10,2),
  stop_loss    NUMERIC(10,2),
  status       TEXT DEFAULT 'OPEN', -- OPEN / CLOSED / CANCELLED
  strategy     TEXT,                -- which scanner strategy (ema-pullback, vcp, etc.)
  created_at   TIMESTAMPTZ DEFAULT now(),
  closed_at    TIMESTAMPTZ
);
```

#### New API routes:
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/kite/order` | POST | Place a new order |
| `/api/kite/order/:id/cancel` | POST | Cancel within 5s window |
| `/api/kite/orders` | GET | List today's orders from Kite |

---

### 3.6 Portfolio Page (Revamp)

The existing `/stocks/portfolio` page becomes a real-time trading dashboard pulling live data from Kite.

#### Tabs / sections:

**Holdings tab** (long-term positions):
- Pulls from `GET /api/kite/holdings` → KiteConnect.getHoldings()
- Columns: Stock · Qty · Avg Buy · LTP · Day P&L · Total P&L% · Target · SL
- Color coded: green if above target, red if below SL
- "Sell" button per row (pre-filled with current qty)

**Positions tab** (today's intraday):
- Pulls from `GET /api/kite/positions` → KiteConnect.getPositions()
- Same columns + realised/unrealised split

**My Trades tab** (your internal log):
- Reads from your `trades` table
- Shows which strategy signal led to each trade
- P&L calculated from avg buy price vs current price
- Filter by: strategy, date range, open/closed

**Set Target & SL:**
- Each row in Holdings/My Trades has "Set Target / SL" icon
- Opens a small inline form to set `target_price` and `stop_loss` in your `trades` table
- These are tracked in your DB, not sent to Kite (for now)

#### New API routes:
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/kite/holdings` | GET | Proxy Kite holdings for this user |
| `/api/kite/positions` | GET | Proxy Kite positions for this user |
| `/api/trades` | GET | Your internal trades log |
| `/api/trades/:id` | PATCH | Update target/SL on a trade |

---

### 3.7 User Management (Settings)

A small **Manage Users** section on `/stocks/settings` — no separate admin page. Keeps the two-person setup simple while avoiding manual `seed-users.ts` runs for every new account.

**Who can use it:** Any logged-in stocks-section user (Sanjay + Brother). Both can add/remove other stocks users.

**Features:**
| Action | Details |
|--------|---------|
| List users | Show all users where `section = "stocks"`: username, display name, created date |
| Add user | Form: username, display name, temporary password → creates better-auth user with `section: "stocks"` |
| Remove user | Delete a stocks user (cannot delete yourself; must keep ≥1 stocks user) |
| Change own password | Already exists — stays in the Account section above |

**API routes:**
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/stocks/users` | GET | List stocks-section users |
| `/api/stocks/users` | POST | Create a new stocks user |
| `/api/stocks/users/:id` | DELETE | Remove a stocks user |

**UI placement:** Settings page → new **Users** section between Account and Notifications.

**Out of scope:** Admin/viewer users, role hierarchies, email verification, password reset flows.

---

### 3.8 Notification Center Overhaul

The bell icon and push infrastructure exist but the in-app experience is incomplete. This sprint makes notifications feel like a real inbox.

#### Current gaps (as of today)
- Green dot on bell = "push enabled", not "you have unread items"
- Dropdown items are not clickable — no navigation to signals / settings
- No read/unread tracking (logs are global, not per-user)
- Push payload includes `url` but `NotificationLog` does not store it, so in-app history can't deep-link
- No "Mark all as read"

#### Target UX

**Bell badge:**
- Remove the green dot entirely
- Show a **numeric badge** (e.g. `3`) when unread count > 0; hide badge when 0
- Cap display at `9+` for counts above 9
- Poll unread count on load + when bell opens (lightweight GET)

**Dropdown (in-app inbox):**
- Each row is clickable → navigates to the notification's `url` (e.g. `/stocks?status=open&fresh=1`) and marks that notification as read
- Unread rows: subtle left accent bar or bold title; read rows: muted styling
- Header actions: **Mark all as read**
- Empty state unchanged ("No notifications sent yet")
- Relative timestamp (`2h ago`) — already exists

**Push notification click (service worker):**
- Already navigates via `data.url` — keep this behaviour
- On click, also call API to mark that notification as read for the logged-in user (best-effort; SW may not have session — see implementation note below)

**Kite reconnect push (from §3.4):**
- Deep-link to `/stocks/settings`
- Same read/unread rules apply

#### DB addition — per-user read state (MongoDB)

```javascript
// notification_reads collection
{
  userId:       String,   // better-auth user id
  notificationId: ObjectId, // FK to NotificationLog._id
  readAt:       Date,
}
// compound unique index: { userId, notificationId }
```

#### Extend `NotificationLog` schema

Add fields when creating log entries:
```javascript
{
  url: String,    // deep-link target, e.g. "/stocks?status=open&fresh=1"
  tag: String,    // push tag for dedup, e.g. "morning-brief"
}
```

Backfill not required — old entries without `url` fall back to `/stocks`.

#### New / updated API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/stocks/notifications` | GET | List recent notifications **with per-user read state** + unread count |
| `/api/stocks/notifications/:id/read` | POST | Mark one notification as read for current user |
| `/api/stocks/notifications/read-all` | POST | Mark all visible notifications as read |
| `/api/stocks/notifications/unread-count` | GET | Lightweight badge count (optional; can fold into GET above) |

**SW read-on-click note:** Service worker cannot easily attach session cookies on a background POST. Two options — pick during implementation:
1. **Preferred:** Client-side `BroadcastChannel` / `postMessage` — when SW opens/focuses the app, the page marks notifications read by matching `tag` + recent timestamp.
2. **Fallback:** Accept that push-click read state syncs on next bell open (user sees item briefly as unread).

#### Update push send pipeline

When `/api/stocks/push/send` creates a `NotificationLog`, also persist `url` and `tag` from `PushMessage`. Ensure webpush payload JSON includes `url`, `tag`, and `notificationId` (log `_id`) so the SW can correlate.

---

### 3.9 Phase 2 — Fully Automated Trading (Later)

Once you've tested one-click for a few weeks and trust the signals:

1. Add a toggle in Settings: "Auto-execute signals" (OFF by default)
2. Scanner (Python) writes signals to DB as usual
3. Add a Vercel Cron (or polling endpoint) that runs every 5–10 min during market hours (9:15–15:30 IST)
4. Cron checks for new signals since last run → places orders automatically for users with auto-execute ON
5. Slack/push notification sent for each auto-placed order
6. Emergency kill switch: "Pause all automation" button

**The interface you're building in Phase 1 works identically in Phase 2** — the only change is the trigger (human click vs. cron).

---

## 4. Technical Architecture

```
Browser (Next.js)
  └── /stocks/portfolio          ← revamped portfolio dashboard
  └── /stocks/settings           ← Kite connect + user management + notifications + trade defaults
  └── Signal cards (existing)    ← + Buy/Sell buttons
  └── App shell bell             ← unread badge + clickable notification inbox

Next.js API Routes
  ├── /api/kite/login            ← redirect to Kite OAuth
  ├── /api/kite/callback         ← receive token, store in DB
  ├── /api/kite/status           ← is user connected?
  ├── /api/kite/order            ← place / cancel order
  ├── /api/kite/holdings         ← proxy Kite holdings
  ├── /api/kite/positions        ← proxy Kite positions
  ├── /api/kite/orders           ← proxy Kite orders
  ├── /api/trades                ← internal trade log CRUD
  ├── /api/stocks/users          ← list / create / delete stocks users
  ├── /api/stocks/notifications  ← inbox with read state (+ read / read-all)
  └── /api/cron/kite-remind      ← daily 8:30am push notification

External
  └── KiteConnect SDK (kiteconnect npm)  ← wraps all Kite REST calls
  └── Kite servers (OAuth + order API)

DB
  ├── Neon Postgres
  │   ├── kite_sessions          ← per-user access tokens
  │   ├── trades                 ← internal trade log + target/SL
  │   └── swing.*                ← existing signal tables (unchanged)
  └── MongoDB Atlas
      ├── better-auth users      ← unchanged; managed via /stocks/settings Users section
      ├── notification_logs      ← extended with url + tag
      └── notification_reads     ← per-user read state
```

---

## 5. New Pages & UI Changes Summary

| What | Where | Change Type |
|------|-------|-------------|
| Kite connect/disconnect | `/stocks/settings` | Add section to existing page |
| Manage users | `/stocks/settings` | New section — list / add / remove stocks users |
| Default trade size | `/stocks/settings` | Input for ₹ per trade (Phase 1 trading) |
| Token expired banner | `/stocks` (main page) + layout | New conditional banner |
| Buy / Sell buttons | All signal cards | Add to existing `signal-card.tsx` |
| Portfolio revamp | `/stocks/portfolio` | Full revamp with Kite data |
| Trade log tab | `/stocks/portfolio` | New tab |
| Notification badge | App shell bell (`app-shell.tsx`) | Replace green dot with unread count bubble |
| Notification inbox | App shell bell dropdown | Clickable rows, read/unread styling, mark all read |

---

## 6. Implementation Order

### Sprint 0 — Notifications & User Management (can ship before Kite)
1. Extend `NotificationLog` with `url` + `tag`; update push send pipeline
2. Create `notification_reads` collection + read/unread API routes
3. Overhaul bell dropdown: unread badge, clickable rows, mark all read
4. Wire push-click → mark read (BroadcastChannel or bell-open sync)
5. Add **Manage Users** section + `/api/stocks/users` routes

### Sprint 1 — Kite Foundation (everything else depends on this)
6. Install `kiteconnect` npm package
7. Create `kite_sessions` table in Neon
8. Build `/api/kite/login` + `/api/kite/callback`
9. Add "Connect Kite" section to Settings page
10. Build `/api/kite/status` + show token status in Settings

### Sprint 2 — Trading
11. Create `trades` table in Neon
12. Build `/api/kite/order` (place + cancel)
13. Add Buy/Sell buttons to signal cards
14. Add toast with 5-second cancel window

### Sprint 3 — Portfolio
15. Build `/api/kite/holdings` + `/api/kite/positions`
16. Revamp `/stocks/portfolio` with Holdings + Positions tabs
17. Build `/api/trades` CRUD
18. Add My Trades tab with target/SL editor

### Sprint 4 — Kite Notifications & Polish
19. Build `/api/cron/kite-remind`
20. Add `vercel.json` cron schedule
21. Add token-expired banner on main stocks page
22. Add default trade size to Settings (₹ per trade)

### Sprint 5 — Phase 2 (later, after real-world testing)
23. Auto-execute toggle in Settings
24. Cron-based signal execution
25. Kill switch

---

## 7. Open Questions / Decisions Needed

| # | Question | Notes |
|---|----------|-------|
| 1 | Kite Connect plan | **Personal (Free)** is enough for Phase 1; upgrade to ₹500/mo only if live Kite quotes needed |
| 2 | Redirect URL | Must set `https://mcubetechstudio.com/api/kite/callback` in Kite developer console |
| 3 | Exchange default | NSE for all signals, or configurable per stock? |
| 4 | Default order type | MARKET order for simplicity, or LIMIT at signal price? |
| 5 | Default qty / position sizing | Fixed ₹ amount per trade, or fixed qty, or % of capital? |
| 6 | Whose Kite app | One developer app (Sanjay) — **one** key/secret in Vercel; brother only OAuth-connects his Zerodha account |
| 7 | User management access | PRD assumes both stocks users can add/remove others — OK, or restrict to one "owner" account? |
| 8 | Notification history depth | How many past notifications to show in dropdown? (Default: 20, same as today) |
| 9 | Static IP strategy | **Deferred to Sprint 2.** Likely Railway Pro relay; home/multi-ISP not viable |

---

## 8. What We Need From You Before / During Implementation

### Blockers — cannot start Kite work without these

| # | Item | Who | Action |
|---|------|-----|--------|
| A | **Kite Connect app** | Sanjay (once) | [developers.kite.trade](https://developers.kite.trade) → Personal (Free) app |
| B | **API credentials** | Sanjay | One `api_key` + `api_secret` → Vercel env vars only (brother does **not** add his own) |
| C | **Redirect URL** | Sanjay | `https://mcubetechstudio.com/api/kite/callback` in Kite app settings |
| D | **Static IP strategy** | Sanjay | Pick Option A–D in §3.1; whitelist IP in Kite before live orders (not needed for OAuth/portfolio) |
| E | **Trading decisions** | Both | Exchange, order type, position sizing (open questions #3–5) |

### Env vars to add in Vercel (Kite sprint)

**One pair for the whole app** — not per user:

```
KITE_API_KEY=your_api_key
KITE_API_SECRET=your_api_secret
```

Brother’s Zerodha account is linked at **runtime** via OAuth (“Connect Kite” in Settings), not via extra env vars.

Existing vars (`MONGODB_URI`, `AUTH_SECRET`, `VAPID_*`, `CRON_SECRET`, Neon connection) should already be set — confirm they are present in production.

### Decisions needed from you (pick one option each)

**Exchange (#3):** NSE only for all orders? (Recommended — matches scanner output.)

**Order type (#4):** MARKET buy on click? (Recommended for speed.) Or LIMIT at signal entry price?

**Position sizing (#5):** What default ₹ per trade? (PRD suggests e.g. ₹10,000 — give your number.)

**User management (#7):** Can both of you add/remove stocks users, or only one account?

### Can start immediately — no blockers

Sprint 0 (notifications + user management) needs **none** of the Kite items above. We can ship that first while you set up the Kite developer account.

### Nice to have (not blocking)

| Item | Why |
|------|-----|
| Brother's real username | So we know which seeded account is his vs yours |
| Test Kite account (optional) | Paper trading isn't native in Connect — you'd use small qty live orders for testing |
| Confirm Neon Postgres URL | `kite_sessions` + `trades` tables go in Neon alongside existing `swing.*` signal schema |

### Your checklist (copy/paste)

- [ ] Create Kite Connect developer app (Personal Free)
- [ ] Add `KITE_API_KEY` and `KITE_API_SECRET` to Vercel (+ `.env.local`)
- [ ] Set redirect URL in Kite console
- [ ] Static IP: **deferred** — pick Railway Pro / VPS / other before Sprint 2 (Buy/Sell)
- [ ] Redeploy production
- [ ] Brother: log into MCube → Settings → Connect Kite (his Zerodha login — no separate keys)
- [ ] Tell us: NSE only? MARKET or LIMIT? Default ₹ per trade?
- [ ] Tell us: both users can manage users, or one owner only?
- [ ] (Optional) Confirm usernames for you + brother in production

---

*End of PRD*
