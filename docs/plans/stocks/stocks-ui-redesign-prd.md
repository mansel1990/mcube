# PRD: Stocks Section UI Redesign

**Status:** Ready for implementation  
**Scope:** `/stocks` section — UI consolidation, user trade logging (new schema), portfolio v1, push notification upgrades, PWA manifest  
**Goal:** Sharper, cleaner trading UI with a clear separation between **simulated strategy outcomes** (system-wide mock buys) and **your real portfolio** (per-user logged trades). Consolidate 7 scattered strategy pages into one unified signals view. Enable manual "Log buy" on signals so users can start tracking real trades before Kite integration.

---

## 1. Background & Context

The stocks section currently has **11 sidebar nav items** — one for each strategy (Breakout, EMA Pullback, VCP, RS Resilience, Mean Reversion, Fib Pullback, Fear Reversion), plus Manish Logic (home), Performance, Chart, and Settings. Each strategy is a separate route that renders the same `SignalCard` component with a different data source.

All data today is **system-wide and simulated**. The Python scanner auto-logs ₹10,000 mock positions into `swing.strategy_performance`. Manish Logic closed trades live in a separate History tab with the same ₹10k assumption. There is **no per-user trade tracking** and no distinction between "what the strategy would have done" vs "what I actually bought."

Problems:
- Too much nav clutter — 7 separate routes for structurally identical views
- Chart page is unused and adding noise
- Manish Logic signals are isolated from strategy signals — hard to compare across strategies
- Mobile bottom nav wastes a slot on Chart
- Notification opt-in is a floating banner (component exists but is **not wired anywhere**)
- **Mock vs real confusion** — Performance page looks like "my results" but is global simulation; no place for actual user trades
- Mock outcomes split across Performance (swing) and Manish History tab (home) — not one coherent view
- Push notifications only cover Manish Logic, fire at 9:15 AM, and say "active signals" rather than actionable buy ideas
- No PWA manifest — home-screen install works partially but lacks proper app metadata

---

## 2. Product Model — Three Distinct Views

Every page in the new nav maps to exactly one question. **Never mix simulated and real numbers on the same page.**

| Nav item | Path | Question it answers | Data owner |
|---|---|---|---|
| **Signals** | `/stocks` | What do strategies recommend today? | System scanner (shared) |
| **Simulated** | `/stocks/performance` | If we auto-bought every signal at ₹10k, how did each strategy perform? | System scanner (shared) |
| **Portfolio** | `/stocks/portfolio` | What did **I** actually buy, and what's **my** P&L? | Logged-in user only |

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│     Signals     │     │      Simulated       │     │    Portfolio    │
│  Recommendations│     │  ₹10k auto-buy mock  │     │  My real trades │
│   (all users)   │     │     (all users)      │     │  (per user)     │
└────────┬────────┘     └──────────┬───────────┘     └────────┬────────┘
         │                         │                          │
         │    "Log buy" button     │                          │
         └─────────────────────────┼──────────────────────────┘
                                   │
                          user_trades table
                          (MongoDB, userId)
```

---

## 3. Design Principles

- **Light and sharp** — keep the existing white/slate palette. Improve density and hierarchy, not color scheme. Each card stays mostly monochrome; the source colour appears in exactly two places (a 3px left-edge stripe + a small badge) so a grid of 8 source colours doesn't read as visually loud.
- **Data-first** — every card shows all useful numbers at a glance. No click required to see entry, target, SL, P&L.
- **Mock vs real always visible** — Simulated Performance carries a persistent banner: *"Hypothetical ₹10,000 auto-buy per signal. Not your real trades."* Portfolio carries: *"Your logged trades only."* Never show user P&L on the Simulated page or mock P&L on Portfolio.
- **Mobile-first layouts** — test every change on the mobile bottom nav and PWA viewport.
- **No stacked sticky bars on mobile** — beyond the app header, no element is sticky on mobile (`<md`). The stats bar is sticky on desktop only. Filter chips and the status toggle scroll away with content on mobile.
- **No new dependencies** — use existing Tailwind, Lucide, Recharts, and MongoDB (already used for push subscriptions). Do not add new npm packages.
- **Minimal new API surface** — one signals aggregator route, one user-trades CRUD route group, and targeted modifications to the push send route. Existing scanner API routes stay untouched.

---

## 4. What Changes

### 4.1 Remove — Chart Page

Delete the following files entirely:
```
app/(stocks)/stocks/chart/page.tsx
components/stocks/stocks-dashboard.tsx
components/stocks/ohlcv-chart.tsx
```

Remove `/api/stocks/ohlcv/route.ts` only if it has no other consumers (check with grep first). If it does have other consumers, leave it alone.

### 4.2 Replace — Individual Strategy Pages (redirect shims, not hard deletes)

The 7 strategy page routes are **not** hard-deleted in this PRD. Instead, each `page.tsx` is replaced with a 3-line redirect shim that forwards to the unified signals page with the appropriate filter pre-applied:

```ts
// app/(stocks)/stocks/breakout/page.tsx
import { redirect } from "next/navigation";
export default function Page() {
  redirect("/stocks?strategy=breakout&status=open");
}
```

This protects old bookmarks and any push-notification payloads that link to `/stocks/breakout` etc. Apply the same pattern to all 7 strategy routes (with the appropriate `strategy=` value):

```
app/(stocks)/stocks/breakout/page.tsx          → ?strategy=breakout
app/(stocks)/stocks/ema-pullback/page.tsx      → ?strategy=ema_pullback
app/(stocks)/stocks/vcp/page.tsx               → ?strategy=vcp
app/(stocks)/stocks/rs-resilience/page.tsx     → ?strategy=rs_resilience
app/(stocks)/stocks/mean-reversion/page.tsx    → ?strategy=mean_reversion
app/(stocks)/stocks/fib-pullback/page.tsx      → ?strategy=fib_pullback
app/(stocks)/stocks/fear-reversion/page.tsx    → ?strategy=fear_reversion
```

The corresponding `*-client.tsx` files **are** hard-deleted — the unified page renders the same data via `unified-signal-card.tsx`:

```
app/(stocks)/stocks/breakout/breakout-client.tsx
app/(stocks)/stocks/ema-pullback/ema-pullback-client.tsx
app/(stocks)/stocks/vcp/vcp-client.tsx
app/(stocks)/stocks/rs-resilience/rs-resilience-client.tsx
app/(stocks)/stocks/mean-reversion/mean-reversion-client.tsx
app/(stocks)/stocks/fib-pullback/fib-pullback-client.tsx
app/(stocks)/stocks/fear-reversion/fear-reversion-client.tsx
```

The redirect shims themselves should be deleted in a follow-up PR ~30 days post-deployment, once analytics confirm no traffic. That cleanup is **not** in this PRD's scope.

The underlying API routes (`/api/stocks/swing/*`) stay untouched — they're consumed by the new aggregator (§5.1).

Keep `components/stocks/swing/strategy-info-drawer.tsx` — it is reused on the unified card via the info icon (see §6.1).

### 4.3 Update — Navigation (`components/app-shell.tsx`)

**Sidebar `NAV_CONFIG.stocks` — replace with:**

```ts
stocks: [
  { label: "Signals",    href: "/stocks",             icon: Zap,       exact: true,  color: "blue"    },
  { label: "Simulated",  href: "/stocks/performance", icon: BarChart3, exact: false, color: "amber"   },
  { label: "Portfolio",  href: "/stocks/portfolio",   icon: Briefcase, exact: false, color: "emerald" },
],
```

Import `Briefcase` from `lucide-react`.

Remove the `BarChart2` import (was Chart icon) and the `LayoutGrid` import (was the Strategies tab icon) if they're no longer used elsewhere.

**`STRATEGY_HREFS` set** — delete entirely. No remaining code path references it after the mobile Strategies tab is removed.

**`MobileStocksNav` component** — replace the 4-tab layout (Home · Strategies · Performance · Chart) with a clean **3-tab** layout:

```
Signals  |  Simulated  |  Portfolio
```

- Signals → `/stocks` (exact)
- Simulated → `/stocks/performance`
- Portfolio → `/stocks/portfolio`

The `chart` variable and the `Strategies` button in `MobileStocksNav` are both removed. The unified signals page's source-filter chip row (§5.4) replaces the Strategies tab's purpose — adding a second mobile navigation surface for the same action is exactly the kind of clutter this redesign exists to eliminate.

**`StrategiesSheet` component — delete entirely**, along with:
- The `strategiesOpen` state in `AppShell`.
- The `useEffect` that closes it on route change.
- The conditional sheet rendering at the bottom of `AppShell`.
- The `LayoutGrid` import (if not used elsewhere).

---

## 5. Backend — User Trades Schema & API

Users will start logging real buys manually before Kite integration. Store trades in **MongoDB** (consistent with `PushSubscription` and auth user IDs).

### 5.1 MongoDB model

**File:** `lib/models/user-trade.ts`

```ts
interface IUserTrade {
  userId: string;           // better-auth user id
  source: SignalSource;     // strategy that generated the signal
  signalRef: string;        // UnifiedSignal.id, e.g. "breakout-42"
  ticker: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;        // YYYY-MM-DD (IST)
  target: number | null;    // copied from signal at log time (optional reference)
  stopLoss: number | null;
  exitPrice: number | null;
  exitDate: string | null;
  status: "open" | "closed";
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

Index: `{ userId: 1, status: 1 }`, unique partial on `{ userId: 1, signalRef: 1 }` where `status = "open"` — prevents duplicate open logs for the same signal.

### 5.2 API routes

**File:** `app/api/stocks/trades/route.ts`

| Method | Auth | Behaviour |
|---|---|---|
| `GET` | Required | Returns all trades for `session.user.id`. Query param `?status=open\|closed` optional. |
| `POST` | Required | Creates a trade. Body: `{ source, signalRef, ticker, quantity, entryPrice, entryDate, target?, stopLoss?, notes? }`. Validates no duplicate open trade for same `signalRef`. |

**File:** `app/api/stocks/trades/[id]/route.ts`

| Method | Auth | Behaviour |
|---|---|---|
| `PATCH` | Required | Close or edit a trade. Body: `{ exitPrice, exitDate }` to close; or `{ quantity, entryPrice, notes }` to edit open trade. Must verify `userId` matches session. |
| `DELETE` | Required | Delete a trade (mistake correction). Must verify ownership. |

All routes return computed fields on read:
- `invested` = `quantity × entryPrice`
- `currentValue` / `unrealizedPnl` / `unrealizedPnlPct` for open trades (using live price if available)
- `realizedPnl` / `realizedPnlPct` for closed trades

Live prices fetched server-side via existing Yahoo quote logic (reuse from `/api/stocks/current-price`).

---

## 6. New / Replaced — Unified Signals Page

**File:** `app/(stocks)/stocks/page.tsx`  
**Replaces:** Current `SuggestionsPage`-only view  
**Component file:** `components/stocks/unified-signals-page.tsx` (new, "use client")

### 6.1 Data sources — one aggregator route

Add a new read-only server route that fans out to the 8 existing endpoints in parallel and returns one combined payload.

**File:** `app/api/stocks/signals/all/route.ts`

```ts
import { NextResponse } from "next/server";

export async function GET() {
  const results = await Promise.allSettled([
    fetchManishSuggestions(),       // /api/stocks/suggestions logic, reused
    fetchSwing("breakout"),
    fetchSwing("ema_pullback"),
    fetchSwing("vcp"),
    fetchSwing("rs_resilience"),
    fetchSwing("mean_reversion"),
    fetchSwing("fib_pullback"),
    fetchSwing("fear_reversion"),
  ]);
  return NextResponse.json({
    manish:          settled(results[0]),
    breakout:        settled(results[1]),
    ema_pullback:    settled(results[2]),
    vcp:             settled(results[3]),
    rs_resilience:   settled(results[4]),
    mean_reversion:  settled(results[5]),
    fib_pullback:    settled(results[6]),
    fear_reversion:  settled(results[7]),
  });
}
// settled(r) → { ok: true, data: T[] } | { ok: false, error: string }
```

Internally, lift the SQL from each existing route into small helper functions. Don't duplicate query strings — import or share them. **Also export a shared helper** `fetchAllOpenSignals()` for reuse by the push send route (§10).

The unified page therefore makes:
- **1 fetch** to `/api/stocks/signals/all` on mount.
- **1 fetch** to `/api/stocks/current-price?tickers=...` for the deduplicated list of all open tickers across all sources.
- **1 fetch** to `/api/stocks/trades?status=open` to know which signals the user has already logged (for card badges and to disable duplicate "Log buy").

The original 8 routes (`/api/stocks/suggestions`, `/api/stocks/swing/*`) stay unchanged — they remain usable for the redirect-shim deep links and any future per-strategy admin views.

**Source-to-route map (for reference, used inside the aggregator):**

| Source key | Underlying API |
|---|---|
| `manish` | `/api/stocks/suggestions` |
| `breakout` | `/api/stocks/swing/breakout` |
| `ema_pullback` | `/api/stocks/swing/ema-pullback` |
| `vcp` | `/api/stocks/swing/vcp` |
| `rs_resilience` | `/api/stocks/swing/rs-resilience` |
| `mean_reversion` | `/api/stocks/swing/mean-reversion` |
| `fib_pullback` | `/api/stocks/swing/fib-pullback` |
| `fear_reversion` | `/api/stocks/swing/fear-reversion` |

### 6.2 Signal data shape unification

Manish Logic signals (`StockSuggestion`) and swing signals (`SwingSignal`) have different shapes. Create a unified display type:

```ts
interface UnifiedSignal {
  id: string;               // `${source}-${original_id}`
  source: SignalSource;     // "manish" | "breakout" | ...
  ticker: string;
  status: "open" | "closed";
  signalDate: string;       // Manish: signal_date. Swing: date (the scan date).
  entryDate: string | null; // Manish: entry_date. Swing: null (no entry yet).
  entryPrice: number | null;
  entryMin: number | null;
  entryMax: number | null;
  target: number | null;
  stopLoss: number | null;
  cmp: number | null;
  rsi: number | null;
  volumeRatio: number | null;
  signalStrength: string | null;
  // Manish Logic specific (may be null for swing signals)
  exitDate: string | null;
  exitPrice: number | null;
  realizedPnlPct: number | null;  // realized P&L from API (null for swing and for open Manish)
  exitReason: string | null;
  holdDays: number;
  peers: string[] | null;
  entryZ: number | null;
  peerSlopePct: number | null;
}

type SignalSource =
  | "manish"
  | "breakout"
  | "ema_pullback"
  | "vcp"
  | "rs_resilience"
  | "mean_reversion"
  | "fib_pullback"
  | "fear_reversion";
```

Write a mapper function for each source to convert to `UnifiedSignal`. Critical normalization rules:

- **Status casing:** the Manish API returns `"OPEN"` (uppercase). The mapper must lowercase it to `"open"`. Swing signals always map to `"open"` (no closed-trade table exists yet).
- **`signalDate` source:** Manish → `signal_date`. Swing → `date` (the scan date). Never use `entry_date` here.
- **`entryDate` source:** Manish → `entry_date` (may be null if not yet triggered). Swing → always `null`.
- **"Last scan" timestamp** displayed in the stats bar is computed by the page as `MAX(signalDate)` across all unified signals. Never derived from `entryDate`.
- **Unrealized P&L** for open trades is computed in the card component from `entryPrice + currentPrice`. It is intentionally **not** a field on `UnifiedSignal` — the mapper has no access to live prices.

### 6.3 Filter state — synced to URL

Both filters live in the URL so deep links, the browser back button, and the redirect shims from §4.2 all work. Defaults (when no query params): `sourceFilter = "all"`, `statusFilter = "open"`.

```ts
const params = useSearchParams();
const router = useRouter();

const sourceFilter: SignalSource | "all" =
  (params.get("strategy") as SignalSource | null) ?? "all";
const statusFilter: "open" | "closed" =
  params.get("status") === "closed" ? "closed" : "open";

function setSource(s: SignalSource | "all") {
  const next = new URLSearchParams(params);
  if (s === "all") next.delete("strategy"); else next.set("strategy", s);
  router.replace(`/stocks?${next.toString()}`, { scroll: false });
}
function setStatus(s: "open" | "closed") {
  const next = new URLSearchParams(params);
  if (s === "open") next.delete("status"); else next.set("status", s);
  router.replace(`/stocks?${next.toString()}`, { scroll: false });
}
```

### 6.4 Page layout

```
┌─────────────────────────────────────────────────────┐
│  STATS BAR (sticky on desktop only)                  │
│  Open: 12   Closed (14d): 5   Last scan: 6:00 PM    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  SOURCE FILTER CHIPS (horizontally scrollable)       │
│  [All] [Manish] [Breakout] [EMA] [VCP] [RS] ...     │
│                                                      │
│  STATUS TOGGLE (right of chips on desktop,           │
│                 second row on mobile)                │
│  [Open] [Closed]                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  SIGNAL CARDS GRID                                   │
│  1 col mobile / 2 col sm / 3 col lg                  │
└─────────────────────────────────────────────────────┘
```

**Stats bar:**
- `md:sticky md:top-14 md:z-10` — sticky on desktop, static on mobile (no stacked sticky bars on mobile).
- Shows: count of open signals (across visible sources), count of trades closed in the **last 14 days**, "Last scan: [time]" (= `MAX(signalDate)`), and a single refresh icon button that re-fetches the aggregator.

**Source filter chips:**
- Horizontally scrollable single row. Not sticky on either viewport.
- Inactive chips are slate/neutral with a small coloured dot in the strategy colour. Only the **active** chip is fully tinted with its source colour. This keeps the resting state quiet — 8 colours all lit at once would be visually loud.
- Each chip shows a count badge respecting the current `statusFilter`: e.g. "Breakout (3)" in Open mode.
- "All" chip is slate/neutral, shows total count across enabled sources.

**Asymmetry rule (Open vs Closed on Signals page):**
- **Open mode:** all 8 source chips are enabled.
- **Closed mode:** only `manish` is enabled (it's the only source with closed signal data on the scanner side). The 7 swing chips render disabled/greyed-out with a small tooltip on hover: *"Full swing history → Simulated page."* This avoids the "all chips show (0)" broken-looking state.

**Role split (avoid duplication with Simulated Performance):**
- `/stocks` Closed filter = Manish trades closed in the **last 14 days** only. It's a "what happened recently" view of scanner signals.
- `/stocks/performance` = all-time **simulated** outcomes for all strategies (swing auto-mock + Manish mock history merged). Link text must say "View simulated history →" not "View past trades →".

Render a small "View simulated history →" link in the Closed mode empty state and at the bottom of the closed-trade grid (links to `/stocks/performance`).

**Status toggle:**
- Two-button toggle "Open / Closed". Defaults to Open.
- Right of the chip row on desktop (≥sm). Drops to a second row below the chips on mobile.

**Loading state:**
- Render **6 fixed generic skeleton cards** on first paint (1 col mobile / 2 col sm / 3 col lg, matching the eventual grid). As the aggregator response arrives, skeletons are replaced by real cards in source-order. This avoids the layout jank of per-source skeletons that disappear at different times.

**Empty states:**
- **Per-source-filter empty** (e.g. user picks "Breakout" but it has 0 today): inline "No Breakout signals today" inside the grid area.
- **Whole-page empty** (all 8 sources returned 0 in Open mode, e.g. weekend / pre-scan): centred illustration + "Scanner runs daily at 6 PM IST. Check back after market close." with a "View simulated history →" link to `/stocks/performance`.
- **Closed-mode empty** ("Closed" toggle on, no trades closed in last 14 days): "No trades closed in the last 14 days. View simulated history →" linking to `/stocks/performance`.

### 6.5 Notification banner

Remove `NotificationBanner` from the signals page entirely. It moves to Settings (see §9). Do not render it anywhere on the signals page.

---

## 7. Redesigned Signal Card (`components/stocks/swing/unified-signal-card.tsx`)

Create a new card component that handles both Manish Logic and swing signals via the `UnifiedSignal` type. The existing `SuggestionCard` and `SignalCard` are both replaced by this single component.

### 7.0 Visual direction — flat, monochrome, single accent

The current cards use `rounded-2xl` + a gradient header tinted in the strategy colour. With up to 8 strategies displayed on one screen, that gradient approach reads as visually loud. The new card is **flat white**, with the source colour appearing in exactly two small places:

- A **3px left-edge stripe** in the source colour (not top, not gradient).
- A small **strategy badge** (pill) in the source colour at the top-right.

Everything else is slate/white/black. This is what "sharp" looks like across a multi-source grid.

### 7.1 Open signal card layout

```
┌─┬──────────────────────────────────────────────────┐
│ │  TICKER  ₹CMP                  [Manish]  ⓘ      │
│s│  signal date                   [LIVE ●]          │
│t├──────────────────────────────────────────────────┤
│r│  Entry          Target         Stop Loss         │
│i│  ₹xxx           ₹xxx (+x%)     ₹xxx (-x%)        │
│p├──────────────────────────────────────────────────┤
│e│  Current        Unreal. P&L    R:R               │
│ │  ₹xxx           +x.xx%         1:2.3             │
│ ├──────────────────────────────────────────────────┤
│ │  [Vol xAVG]  [RSI xx]                            │
│ │  Volume bar ████░░░░                             │
│ ├──────────────────────────────────────────────────┤
│ │  [Log buy]              or  [✓ In portfolio]   │
└─┴──────────────────────────────────────────────────┘
```

**Left stripe:** `w-[3px]` full-height bar in the source colour, flush to the card's left edge inside the rounded-corner clip.

**Strategy badge:** small pill (`text-[10px]`, source colour `bg-50/text-700`). Labels:
- Manish Logic → blue, label `Manish`
- Breakout → violet, label `Breakout`
- EMA Pullback → emerald, label `EMA`
- VCP → purple, label `VCP`
- RS Resilience → rose, label `RS`
- Mean Reversion → teal, label `Mean Rev`
- Fib Pullback → cyan, label `Fib`
- Fear Reversion → orange, label `Fear Rev`

**Info icon (`ⓘ`):** small button next to the strategy badge. Opens `StrategyInfoDrawer` for that strategy. This is the only entry point to the strategy explanation now that per-strategy pages are gone — keep it discoverable.

**LIVE indicator:** small animated dot + "LIVE" text, shown only when a live current price is available for the ticker (typically Manish Logic open signals, but the page fetches prices for all open tickers — so swing signals with live prices also get LIVE).

**For Manish Logic open signals:** show `entryZ` and `peerSlopePct` in a small row below the vol/RSI pills if non-null:
```
Z: -1.24  Peer slope: +0.8%
```

**For swing signals:**
- The Current cell shows `cmp` (price at signal time) with label "At signal" when no live price is available; switches to the live price when available.
- R:R is computed as `1:((target - entryMin) / (entryMin - stopLoss)).toFixed(1)`.

**For Manish Logic signals where `target` and `stopLoss` are null:**
- The Target, Stop Loss, and R:R cells all render `"—"`. No NaN, no broken layout.
- In place of the `target / stop loss / R:R` row, show `entryZ` and `peerSlopePct` more prominently (still in their own row, but slightly larger). Implementer can pick the exact arrangement; the constraint is: an open Manish card must not have three `"—"` cells in a row.

**Live prices fetch:** the unified page calls `/api/stocks/current-price?tickers=...` for the deduplicated list of all open tickers (across all 8 sources). Pass `currentPrice` as a prop into each card.

**Card hover:** subtle `shadow-md` on hover. No translate, no scale.

### 7.2 Log buy action (open cards only)

Open signal cards get a footer action row. This is the bridge from Signals → Portfolio.

**If user has NOT logged this signal:**
- Show primary **"Log buy"** button (emerald, full-width on mobile, inline on desktop).
- Click opens `LogBuySheet` — a bottom sheet (mobile) / dialog (desktop) with:
  - Ticker + strategy (read-only)
  - Quantity (number input, default 1)
  - Entry price (pre-filled: `entryPrice` for Manish, midpoint of `entryMin`/`entryMax` for swing, overridable)
  - Entry date (default today IST, overridable)
  - Notes (optional textarea)
  - Submit → `POST /api/stocks/trades`
- On success: card updates to "In portfolio" state; optional toast + link to Portfolio.

**If user HAS logged this signal (open trade exists for `signalRef`):**
- Show **"✓ In portfolio"** badge (emerald outline) + small "View →" link to `/stocks/portfolio`.
- No duplicate log allowed for same `signalRef` while open.

**Closed signal cards:** no Log buy button.

**File:** `components/stocks/log-buy-sheet.tsx` (new)

### 7.3 Closed signal card layout

```
┌─┬──────────────────────────────────────────────────┐
│ │  TICKER                       [Manish] [▲+12.4%]│
│s│  signal date                                     │
│t├──────────────────────────────────────────────────┤
│r│  Entry             Exit                          │
│i│  ₹xxx (date)       ₹xxx (date)                   │
│p├──────────────────────────────────────────────────┤
│e│  x days held                    [exit reason]    │
└─┴──────────────────────────────────────────────────┘
```

- The left stripe stays the **source** colour (not green/red). The P&L pill at top-right is green/red. This keeps source identity visible at a glance in the closed view.
- Swing strategies have no closed variant on the Signals page (see §6.4 asymmetry rule) — only Manish Logic ever renders this layout here. Swing closed mock outcomes live on Simulated Performance.

### 7.4 Card sizing & spacing

- `rounded-xl` outer container with `overflow-hidden` so the left stripe clips cleanly.
- `bg-white border border-slate-200` — no gradient, no inner ring.
- Content uses `p-3` padding; the 3px stripe sits **outside** content padding (it spans the full card height).
- Stat cells: `text-[10px] uppercase tracking-wide text-slate-400` labels, `text-sm font-semibold text-slate-900` values.
- Stats grid: `gap-px` with `bg-slate-100` container background to create hairline dividers between cells.

---

## 8. Simulated Performance Page

**File:** `app/(stocks)/stocks/performance/performance-client.tsx`

This page answers: *"If the system auto-bought every signal at ₹10,000, how did each strategy perform?"* It is **not** the user's real portfolio.

### 8.1 Rename & persistent disclaimer

- Page title: **"Simulated Performance"** (was "Strategy Performance").
- Subtitle: **"₹10,000 auto-buy per signal · Hypothetical outcomes · Not your real trades"**
- Render a slim amber info banner below the header on every viewport:

```
ℹ️  These are system-wide simulated results. For your actual trades, go to Portfolio →
```

The banner links to `/stocks/portfolio`. Never show user trade data on this page.

### 8.2 Merge Manish mock history into this page

Currently Manish closed-trade analytics live in `HistoryDashboard` on the home page. **Move them here.**

The performance API response must include Manish Logic simulated trades alongside swing trades. Two approaches (implementer picks the cleaner one):

**Option A (preferred):** Extend `GET /api/stocks/swing/performance` to also return a `manish` section — map closed rows from `sim.stock_suggestions` into the same `Trade` shape (`investment: 10000`, P&L from `pnl_pct × 10000 / 100`). Add Manish to `STRATEGY_META`.

**Option B:** Client fetches `/api/stocks/suggestions` (closed only) in parallel and merges into local state. Simpler backend change but two round-trips.

Either way, the Simulated page becomes the **single source of truth** for all mock outcomes across all 8 strategies. The old Manish History tab is deleted with `SuggestionsPage`.

Manish open signals that haven't closed yet should appear in the trade table with `status: "open"` and live unrealized P&L (same as swing open rows today).

Update closed-mode asymmetry tooltips on Signals page to point here: *"Full swing history → Simulated page."*

### 8.3 Per-strategy summary row (new, above KPI cards)

When `tab === "all"`, render a horizontal scrollable row of mini strategy cards before the KPI grid:

```
[Manish: 2W/1L +₹400] [Breakout: 4W/2L +₹1,200] [EMA: 3W/1L +₹800] ...
```

Each mini card: strategy label (coloured), W/L count, total simulated P&L in rupees. Tappable — clicking sets the tab filter to that strategy. Use `STRATEGY_META` (now includes `manish`).

### 8.4 Sticky strategy filter tabs (desktop only)

Wrap the strategy filter tab row in a `md:sticky md:top-14 md:z-10 md:bg-white md:border-b md:border-slate-100 md:pb-2` container so it stays visible while scrolling through the trade table on desktop. Keep it **static on mobile** to follow the no-stacked-sticky-bars rule from §3.

### 8.5 Charts & table — no structural changes

The charts, KPI cards, and trade history table design stay as-is. All P&L labels should say "Simulated" where ambiguous (e.g. KPI card footnote: *"Based on ₹10k per signal"*).

---

## 9. Portfolio Page — Real User Trades

**New files:**
```
app/(stocks)/stocks/portfolio/page.tsx
components/stocks/portfolio/portfolio-page.tsx
components/stocks/portfolio/trade-card.tsx
components/stocks/portfolio/close-trade-sheet.tsx
```

### 9.1 `page.tsx`

Thin server component. Renders `<PortfolioPage />`. Inherits auth from stocks layout — unauthenticated users never reach this page.

### 9.2 `portfolio-page.tsx` (client component)

Answers: *"What did I actually buy, and how am I doing?"*

**Header:**
```
┌─────────────────────────────────────────────────────┐
│  [Briefcase icon]  My Portfolio                      │
│  Your logged trades · Real P&L                       │
│                                                      │
│  Total invested: ₹X   Unrealized: +₹Y   Realized: +₹Z│
└─────────────────────────────────────────────────────┘
```

KPI row computed from `/api/stocks/trades` response. Only this user's trades.

**Three tabs** (pill toggle, URL-synced `?tab=open|closed|today`):

| Tab | Content |
|---|---|
| **Open** | User's open positions. Each row/card: ticker, strategy badge, entry price × qty, live CMP, unrealized P&L, target/SL reference from log time. Actions: **Close trade** (opens sheet), **Edit** (qty/price/notes). |
| **Closed** | User's closed trades. Entry/exit dates, realized P&L, hold days. Sortable by exit date desc. |
| **Today** | Open signals from `/api/stocks/signals/all` that the user has **not** yet logged. This is the "what to buy today" view inside Portfolio — cross-references scanner output with user's open trade list. Cards reuse a compact signal summary (ticker, strategy, entry range) + **Log buy** button. Empty state: "You're caught up — no new signals to log." |

**Close trade sheet** (`close-trade-sheet.tsx`):
- Exit price (default: live CMP)
- Exit date (default: today IST)
- Submit → `PATCH /api/stocks/trades/[id]` with `{ exitPrice, exitDate, status: "closed" }`

**Empty state (no trades ever):**
```
┌──────────────────────────────────────────────┐
│  [Briefcase icon]                             │
│  No trades logged yet                         │
│  Browse Signals and tap "Log buy" on any     │
│  recommendation to start tracking here.       │
│                                              │
│  [Browse signals →]                           │
└──────────────────────────────────────────────┘
```

**Future Kite hook (disabled footer, not a blocker):**
At the bottom of the page, a muted row:
```
Connect Kite to sync holdings automatically · Coming soon
```
This replaces the old "Portfolio = Kite placeholder only" approach. Kite is additive later, not a prerequisite for Portfolio v1.

---

## 10. Push Notifications — Morning Buy Alert

Infrastructure mostly exists (`sw.js`, VAPID, subscribe API, Vercel cron). This PRD wires opt-in UI and upgrades content + timing.

### 10.1 Enable opt-in (Settings)

See §11. Move subscription logic from dead `NotificationBanner` into `NotificationSettingsCard` on Settings page. **Must be wired** — today the banner component exists but is imported nowhere.

### 10.2 Cron schedule — 9:00 AM IST buy alert

Update `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/stocks/push/send?event=morning",
      "schedule": "30 3 * * 1-5"
    },
    {
      "path": "/api/stocks/push/send?event=scan",
      "schedule": "0 13 * * 1-5"
    }
  ]
}
```

| Event | UTC cron | IST | Purpose |
|---|---|---|---|
| `morning` | `30 3 * * 1-5` | **9:00 AM** | "What to buy today" — all open signals from last night's scan |
| `scan` | `0 13 * * 1-5` | **6:30 PM** | "Scanner finished" — new signals available for review |

Remove the old `open`/`close` market bell events (9:15 AM / 3:00 PM). The morning alert replaces the open event with actionable content. The 6:30 PM scan alert replaces the close event — scanner runs ~6 PM, so notify after it completes.

Keep existing weekend + NSE holiday skip logic in the send route.

### 10.3 Design constraints — why not list every ticker

With 8 strategies firing daily, a busy scan can produce **10–20+ signals**. Mobile push bodies truncate hard:

| Platform | Practical limit |
|---|---|
| iOS lock screen | ~2 lines (~80–120 chars) |
| Android | ~3–4 lines (~150 chars) |
| Web push (desktop) | More room, but design for mobile |

Listing `"Breakout: TATASTEEL · EMA: INFY · VCP: HAL · RS: …"` breaks on the lock screen and reads as noise. The morning alert must answer one question in under 3 seconds: **"Is there anything to look at, and how much?"**

**Design rules:**
1. **Fresh signals only** — not the entire open book (Manish can carry weeks-old opens).
2. **Tiered copy** — low volume lists tickers; high volume shows counts only.
3. **Strategy counts over ticker lists** when total ≥ 4.
4. **One notification per event** — use `tag` to replace, never stack duplicates.
5. **Tap → filtered in-app view** — notification is a teaser; the app shows the full list.

### 10.4 Signal selection — what "morning" includes

Morning push at 9:00 AM IST covers **fresh signals from the most recent scan**, not every historical open.

**Define `lastScanDate`** = `MAX(signalDate)` across all 8 sources (the date the Python scanner last wrote rows — typically yesterday ~6 PM IST on trading days).

**Include in morning brief:**
- All open signals where `signalDate === lastScanDate`.

**Exclude from morning brief (still visible in app):**
- Manish (or any) open signals with older `signalDate` — these are carry-over positions, not new buy ideas.
- Closed signals.

**Why:** At 9 AM the user wants *"what came in last night's scan that I should review before market opens"*, not a dump of every open Manish trade from the last 3 weeks.

**Edge cases:**

| Case | Behaviour |
|---|---|
| Monday 9 AM, last scan was Friday | `lastScanDate` = Friday. Correct — weekend has no scan. |
| Scanner failed last night | `lastScanDate` is stale. Body: *"No new scan · last ideas from Fri. Tap to review."* |
| Zero fresh signals | See tier 0 below. |
| User already logged some via Portfolio | Broadcast is same for all users; Portfolio **Today** tab shows per-user "not yet logged" state after tap. |

### 10.5 Copy tiers — morning (`event=morning`)

Implement in **`lib/stocks/push-copy.ts`** as pure functions (testable, no side effects).

**Strategy short labels** (for compact bodies):

```ts
const SOURCE_SHORT: Record<SignalSource, string> = {
  manish: "Manish",
  breakout: "Breakout",
  ema_pullback: "EMA",
  vcp: "VCP",
  rs_resilience: "RS",
  mean_reversion: "Mean Rev",
  fib_pullback: "Fib",
  fear_reversion: "Fear",
};
```

**Sort strategies in body:** by count descending, then fixed priority order (Manish → Breakout → EMA → VCP → RS → Mean Rev → Fib → Fear).

**Helper:** `formatSourceCounts(bySource, maxShow = 4)` → `"Breakout 3 · EMA 2 · VCP 2 · Manish 1"` or `"Breakout 3 · EMA 2 · +2 strats"` when more than `maxShow` strategies have signals.

#### Tier 0 — zero fresh signals

```
Title: No new ideas · 9 AM
Body:  Nothing from last night's scan. Next scan at 6 PM.
URL:   /stocks?status=open
```

#### Tier 1 — 1–3 signals (name them)

Short enough to list every ticker with strategy.

```
Title: 2 buy ideas · Tue 9 AM
Body:  Breakout: TATASTEEL · EMA: INFY
URL:   /stocks?status=open&fresh=1
```

```
Title: 1 buy idea · Tue 9 AM
Body:  VCP: HAL
URL:   /stocks?status=open&fresh=1
```

#### Tier 2 — 4–8 signals (counts + top 2 tickers)

```
Title: 6 buy ideas · Tue 9 AM
Body:  Breakout 2 · EMA 2 · VCP 1 · Manish 1 — TATASTEEL, INFY +4
URL:   /stocks?status=open&fresh=1
```

Body formula: `{sourceCounts} — {ticker1}, {ticker2} +{total - 2}`.

Pick top 2 tickers by strategy priority (Manish first, then Breakout, etc.) — not alphabetical.

#### Tier 3 — 9+ signals (counts only, no ticker list)

```
Title: 14 buy ideas · Tue 9 AM
Body:  Breakout 4 · EMA 3 · VCP 2 · Manish 2 · +2 strats. Tap to review.
URL:   /stocks?status=open&fresh=1
```

Never list individual tickers at this tier. The title carries the total; the body carries the strategy breakdown.

#### Stale scan fallback

When `lastScanDate` is more than 1 trading day old (scanner missed a run):

```
Title: 6 ideas · last scan Fri
Body:  Breakout 2 · EMA 2 · VCP 2. No new scan last night.
URL:   /stocks?status=open&fresh=1
```

### 10.6 Evening scan alert (`event=scan`)

Evening push is always **count-based** — never list tickers (user hasn't reviewed yet; they'll tap in).

```
Title: Scanner done · 6:30 PM
Body:  8 new signals across 4 strategies. Tap to review.
URL:   /stocks?status=open&fresh=1
```

Body formula: `{total} new signal{s} across {activeStrategyCount} strateg{y|ies}. Tap to review.`

If zero: skip sending (don't notify "0 new signals"). Log to `NotificationLog` with `sent: 0` for debugging only.

### 10.7 Payload shape & service worker

**Server payload** (JSON string passed to `webpush.sendNotification`):

```ts
interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;           // "morning-brief" | "scan-brief" — replaces prior same-tag notification
  totalCount: number;    // stored for NotificationLog + in-app bell history
  bySource: Partial<Record<SignalSource, number>>;
}
```

**Modify `public/sw.js`** to pass `tag` through:

```js
self.registration.showNotification(data.title || "MCube Stocks", {
  body: data.body || "",
  icon: "/logo.png",
  badge: "/logo.png",
  tag: data.tag || "mcube-stocks",   // replaces previous notification with same tag
  renotify: true,                     // bump/shade if content changed since last morning
  data: { url: data.url || "/stocks" },
});
```

Keep payload under **240 chars total** (title + body) for tier 3 bodies. The `buildMorningPush()` function must truncate strategy breakdown if needed:

```ts
function clampBody(body: string, maxLen = 160): string {
  if (body.length <= maxLen) return body;
  return body.slice(0, maxLen - 1).trimEnd() + "…";
}
```

### 10.8 In-app landing — `fresh=1` query param

When user taps the morning notification, land on Signals with fresh filter pre-applied.

**Unified signals page** (§6): honour `?fresh=1` URL param:
- Filter to signals where `signalDate === lastScanDate` (same logic as push selection).
- Stats bar adds a subtle label: **"Last scan · 12 ideas"** when fresh filter active.
- Chip row unchanged — counts reflect fresh subset only.
- Clearing fresh filter shows full open book (including carry-over Manish).

Portfolio **Today** tab (§9) remains the per-user view of signals not yet logged — link to it from the fresh-filter banner: *"See what you haven't logged → Portfolio"*.

### 10.9 Implementation — `app/api/stocks/push/send/route.ts`

- Import `fetchAllOpenSignals()` from aggregator helpers (§6.1).
- Import `buildMorningPush()` / `buildScanPush()` from `lib/stocks/push-copy.ts`.
- Compute `lastScanDate`, filter fresh open signals, call tier builder.
- Store full `bySource` breakdown in `NotificationLog` (extend schema with optional `meta: { totalCount, bySource, lastScanDate }` field) so the in-app bell history shows richer entries than the truncated push body.
- Still broadcast to all subscribers — per-user "unlogged only" push is Phase 2 (would require N individual sends).

**File to create:** `lib/stocks/push-copy.ts`  
**File to modify:** `lib/models/notification-log.ts` — add optional `meta` object field.

### 10.10 PWA manifest for home-screen install

**New file:** `public/manifest.json`

```json
{
  "name": "MCube Stocks",
  "short_name": "MCube",
  "description": "Daily stock signals and portfolio tracking",
  "start_url": "/stocks",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1e40af",
  "icons": [
    { "src": "/logo.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/logo.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Modify:** root `app/layout.tsx` — add `<link rel="manifest" href="/manifest.json" />` and `<meta name="theme-color" content="#1e40af" />`.

Web push on installed PWAs:
- **Android Chrome:** works after Settings → Enable Notifications.
- **iOS 16.4+:** works only after Add to Home Screen + enable in Settings. Document this in the notification settings card helper text.

---

## 11. Settings Page — Notification Toggle

**File:** `app/(stocks)/stocks/settings/page.tsx`

The current settings page only has a "Change Password" form. Expand it to a proper settings layout with two sections.

### 11.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  Settings                                           │
├─────────────────────────────────────────────────────┤
│  Account                                            │
│  ┌─────────────────────────────────────────────┐   │
│  │ Change Password  [form, collapsible]         │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Notifications                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🔔 Daily Buy Alerts     [Enable / Enabled ✓]│   │
│  │ Get a push at 9:00 AM with today's buy      │   │
│  │ ideas, and at 6:30 PM when the scanner      │   │
│  │ finishes. Requires home-screen install on   │   │
│  │ iOS.                                        │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 11.2 Notifications card

Move the full subscription logic out of `NotificationBanner` into a new `NotificationSettingsCard` component (or inline it in settings). The logic is identical — check `Notification.permission`, call `navigator.serviceWorker.register`, `pushManager.subscribe`, POST to `/api/stocks/push/subscribe`. The UI difference:

- **Not yet enabled:** Show a card with Bell icon, description text, and a primary "Enable Notifications" button. No X/dismiss button.
- **Enabled:** Show a card with a green checkmark, "Notifications enabled" label, and a secondary "Disable" button that calls `/api/stocks/push/unsubscribe` and revokes the subscription.
- **Denied by browser:** Show a card explaining that notifications were blocked in the browser, with a link to browser settings instructions.
- **Unsupported:** Hide the card entirely (same as current behaviour).

Delete `notification-banner.tsx` after logic is moved.

### 11.3 Password form

Keep the existing change-password form. Optionally make it collapsible (a "Change Password" button that expands the form). Not strictly required — leave it visible if collapsing adds complexity.

---

## 12. File Summary

### Delete (hard delete)
```
app/(stocks)/stocks/chart/page.tsx
components/stocks/stocks-dashboard.tsx
components/stocks/ohlcv-chart.tsx

app/(stocks)/stocks/breakout/breakout-client.tsx
app/(stocks)/stocks/ema-pullback/ema-pullback-client.tsx
app/(stocks)/stocks/vcp/vcp-client.tsx
app/(stocks)/stocks/rs-resilience/rs-resilience-client.tsx
app/(stocks)/stocks/mean-reversion/mean-reversion-client.tsx
app/(stocks)/stocks/fib-pullback/fib-pullback-client.tsx
app/(stocks)/stocks/fear-reversion/fear-reversion-client.tsx

components/stocks/suggestions/notification-banner.tsx
components/stocks/suggestions/suggestion-card.tsx
components/stocks/suggestions/suggestions-page.tsx
components/stocks/suggestions/trades-dashboard.tsx
components/stocks/suggestions/history-dashboard.tsx
components/stocks/swing/signal-card.tsx
```

The current "Buy & Sell" and "History" tabs from `SuggestionsPage` are dropped intentionally:
- **"Buy & Sell"** (`TradesDashboard`, last-2-days recent-events feed) — replaced by Portfolio **Today** tab (forward-looking: signals not yet logged) and open signal cards showing entry dates.
- **"History"** (`HistoryDashboard`, cumulative P&L chart + closed Manish trades) — merged into **Simulated Performance** page (§8.2). One mock-outcomes page for all strategies.

Check before deleting `app/api/stocks/ohlcv/route.ts` — only remove if nothing else imports it.

### Replace with redirect shim
Each of these `page.tsx` files becomes a 3-line `redirect()` shim pointing to `/stocks?strategy=<key>&status=open`:
```
app/(stocks)/stocks/breakout/page.tsx          → ?strategy=breakout
app/(stocks)/stocks/ema-pullback/page.tsx      → ?strategy=ema_pullback
app/(stocks)/stocks/vcp/page.tsx               → ?strategy=vcp
app/(stocks)/stocks/rs-resilience/page.tsx     → ?strategy=rs_resilience
app/(stocks)/stocks/mean-reversion/page.tsx    → ?strategy=mean_reversion
app/(stocks)/stocks/fib-pullback/page.tsx      → ?strategy=fib_pullback
app/(stocks)/stocks/fear-reversion/page.tsx    → ?strategy=fear_reversion
```

These shims are themselves deleted in a follow-up PR ~30 days post-deployment, once analytics confirm zero traffic.

### Create
```
lib/models/user-trade.ts
lib/stocks/signal-helpers.ts                         — shared fetch helpers lifted from existing routes
lib/stocks/push-copy.ts                              — tiered morning/scan notification copy builders (§10.5–10.6)
app/api/stocks/signals/all/route.ts                  — aggregator route (§6.1)
app/api/stocks/trades/route.ts                       — GET + POST user trades (§5.2)
app/api/stocks/trades/[id]/route.ts                  — PATCH + DELETE (§5.2)
components/stocks/unified-signals-page.tsx
components/stocks/swing/unified-signal-card.tsx
components/stocks/log-buy-sheet.tsx
components/stocks/settings/notification-settings-card.tsx
app/(stocks)/stocks/portfolio/page.tsx
components/stocks/portfolio/portfolio-page.tsx
components/stocks/portfolio/trade-card.tsx
components/stocks/portfolio/close-trade-sheet.tsx
public/manifest.json
```

### Modify
```
app/(stocks)/stocks/page.tsx                         — render <UnifiedSignalsPage />
app/(stocks)/stocks/settings/page.tsx                — add notification settings section
app/layout.tsx                                       — manifest + theme-color links
app/api/stocks/push/send/route.ts                    — morning + scan events, tiered copy (§10)
lib/models/notification-log.ts                       — optional meta field for bySource breakdown
public/sw.js                                         — tag + renotify for replace-not-stack (§10.7)
components/stocks/unified-signals-page.tsx           — honour ?fresh=1 filter (§10.8)
app/api/stocks/swing/performance/route.ts            — include Manish simulated trades (§8.2 Option A)
vercel.json                                          — new cron schedules (§10.2)
components/app-shell.tsx                             — 3-item nav: Signals · Simulated · Portfolio
app/(stocks)/stocks/performance/performance-client.tsx — rename, disclaimer banner, Manish tab, summary row, sticky tabs (§8)
```

---

## 13. Implementation Order

Follow this order to avoid broken states at each step:

1. **User trades model + API** — `lib/models/user-trade.ts`, `app/api/stocks/trades/route.ts`, `[id]/route.ts`. Test with curl/Postman before UI.

2. **Lift signal helpers + aggregator route** — `lib/stocks/signal-helpers.ts`, `app/api/stocks/signals/all/route.ts`. Export `fetchAllOpenSignals()` for push reuse. Verify with curl.

3. **Extend performance API with Manish trades** — §8.2 Option A. Verify Simulated page data includes Manish before UI merge.

4. **Create unified signal card + log buy sheet** — `unified-signal-card.tsx`, `log-buy-sheet.tsx`. Verify: Manish open, Manish null target/SL, Manish closed, swing open, log-buy flow.

5. **Create unified signals page** — consume aggregator + user open trades. Wire URL filters, chips, skeletons, empty states. Do not swap home page yet.

6. **Swap in new home page** — update `app/(stocks)/stocks/page.tsx`. Verify live prices + log buy end-to-end.

7. **Build Portfolio page** — §9. Open / Closed / Today tabs, close-trade sheet, empty states.

8. **Update Simulated Performance page** — rename, disclaimer banner, Manish in tabs, summary row, sticky tabs (§8).

9. **Replace strategy pages with redirect shims** — §4.2. Tap-test push deep links.

10. **Update navigation** — `app-shell.tsx` to 3 tabs. Delete `StrategiesSheet`, `STRATEGY_HREFS`, etc.

11. **Delete old components** — strategy `*-client.tsx`, suggestions page/cards, chart files. Grep for orphans.

12. **Push copy helpers** — `lib/stocks/push-copy.ts`. Unit-test all tiers (0, 1, 2, 3, stale) with fixture signal arrays.

13. **Push + PWA upgrades** — `vercel.json` cron, push send route, `sw.js` tag/renotify, `NotificationLog.meta`, `manifest.json`, layout links, Settings notification card (§10–11).

14. **Fresh filter on Signals page** — `?fresh=1` URL param (§10.8).

15. **Final sweep** — `tsc --noEmit`, grep orphan imports, walk through §15 Verification Checklist.

---

## 14. What Is NOT in Scope

The following remain **Phase 2** (separate PRD):

- Kite personal connect OAuth and automatic holdings sync
- Broker order placement via Kite API
- Importing Kite order history into Portfolio automatically
- Side-by-side mock vs real comparison on a single card
- Per-user push filtering ("only signals I haven't logged") — requires individual sends per subscriber; Portfolio Today tab covers this in-app for now
- Any changes to the Python scanner itself
- Deletion of the 7 redirect shims (separate cleanup PR ~30 days post-deployment)

**Explicitly IN scope for this PRD** (moved from old Phase 2 list):
- Manual "Log buy" on signal cards
- Per-user trade storage and Portfolio v1
- Morning 9 AM push with all-strategy buy ideas
- PWA manifest for home-screen install

---

## 15. Verification Checklist

Before calling this done, verify:

### Signals page
- [ ] `/stocks` loads unified page; network tab shows **one** `/api/stocks/signals/all` request, not 8.
- [ ] Source filter chips show correct counts per strategy in Open mode.
- [ ] Status toggle and source chips sync to URL; browser back works.
- [ ] In Closed mode, 7 swing chips greyed-out with tooltip pointing to Simulated page; only Manish enabled.
- [ ] Live prices load for open signals across all sources.
- [ ] "Log buy" opens sheet, pre-fills entry price, POST creates trade, card shows "✓ In portfolio".
- [ ] Duplicate log blocked for same open signal.
- [ ] Old strategy routes redirect correctly.

### Simulated Performance
- [ ] Page title reads "Simulated Performance" with disclaimer banner linking to Portfolio.
- [ ] Manish Logic trades appear alongside swing trades in table and charts.
- [ ] Per-strategy summary row visible on "All" tab; tappable to filter.
- [ ] Strategy filter tabs sticky on desktop, static on mobile.
- [ ] No user trade data appears on this page.

### Portfolio
- [ ] `/stocks/portfolio` shows only logged-in user's trades.
- [ ] Open tab: live unrealized P&L, close-trade flow works.
- [ ] Closed tab: realized P&L, sorted by exit date.
- [ ] Today tab: shows open signals not yet logged; Log buy works inline.
- [ ] Empty state links to Signals.
- [ ] KPI row (invested / unrealized / realized) matches trade data.

### Navigation & cleanup
- [ ] Desktop sidebar: Signals · Simulated · Portfolio (3 items).
- [ ] Mobile bottom nav: same 3 tabs. No Strategies tab, no Chart.
- [ ] `/stocks/chart` returns 404.
- [ ] No `StrategiesSheet`, `STRATEGY_HREFS`, or orphan imports remain.

### Notifications & PWA
- [ ] Settings page: password form + notification enable/disable works end-to-end.
- [ ] `manifest.json` linked; home-screen install shows "MCube Stocks".
- [ ] Morning push tier 0: zero fresh signals → "No new ideas" copy, no ticker list.
- [ ] Morning push tier 1 (1–3 signals): lists all tickers with strategy labels.
- [ ] Morning push tier 2 (4–8): strategy counts + top 2 tickers + "+N" suffix.
- [ ] Morning push tier 3 (9+): strategy counts only, no ticker laundry list; body ≤ 160 chars.
- [ ] Morning push excludes carry-over Manish opens (signalDate < lastScanDate).
- [ ] Stale scan fallback when lastScanDate > 1 trading day old.
- [ ] Scan push: count-based only; skipped entirely when zero new signals.
- [ ] `sw.js` uses `tag: "morning-brief"` / `"scan-brief"` — second morning push replaces first, does not stack.
- [ ] Notification tap opens `/stocks?status=open&fresh=1`.
- [ ] Signals page honours `?fresh=1` — shows only last-scan signals; banner links to Portfolio Today.
- [ ] `NotificationLog.meta` stores full `bySource` breakdown for bell history.

### General
- [ ] On mobile (390px), only app header is sticky.
- [ ] Loading state: 6 fixed skeleton cards on first paint.
- [ ] No TypeScript errors (`tsc --noEmit`).
- [ ] No console errors on any route.
