# Stocks Predictions UI — Implementation Plan

## Context

The `/stocks` section of the mcube back office currently shows a "coming soon" placeholder.
The backend team runs a Python ML batch system (`bulls_eye_stocks_app`) that predicts NSE stock
prices using Prophet (30-day forecasts) and news sentiment (1D/2D/3D direction).

They write results to a **SQL database** after each prediction run.
This plan wires up a Next.js UI to read from that SQL DB and display predictions
with minimal DB calls (cost-effective, Vercel-hosted, PWA-ready for future push notifications).

**Status**: Waiting on backend DB schema before implementation. Plan is complete otherwise.

---

## Architecture

```
Python Batch System
  └── Writes to SQL DB (after each run)
        └── Calls POST /api/revalidate (webhook) to purge Vercel cache

Next.js (Vercel)
  └── GET /api/stocks/predictions → SQL DB (cached 1 hour via Next.js cache)
        └── /stocks page (server component, cached)
              └── PredictionTable (client component, filter/sort in-memory)
                    └── /stocks/[ticker] page (server component, cached)
```

### Key Decisions

- **One SQL query per cache window** — all predictions fetched in a single query, cached
  at the Next.js layer (`next: { revalidate: 3600 }`). No extra DB calls when user filters/sorts.
- **Client-side filtering/sorting** — React state, zero network calls after initial load.
- **Cache invalidation via webhook** — backend calls `/api/revalidate?secret=REVALIDATE_SECRET`
  after each prediction run. Vercel purges the cache instantly. No polling, no Ably needed.
- **No historical chart for MVP** — stock detail shows prediction fields from DB only.
  Chart can be added later via a backend API endpoint.
- **News sentiment** — shown if backend writes it to SQL; gracefully hidden if absent.

---

## SQL Tables (schema TBD — backend team to confirm)

### `stock_predictions`
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | auto-increment |
| ticker | VARCHAR | e.g. "RELIANCE.NS" |
| company_name | VARCHAR | human-readable name (optional) |
| current_price | DECIMAL | price at time of prediction |
| prophet_prediction | DECIMAL | predicted price 30 days ahead |
| prophet_monthly_return | DECIMAL | expected return % |
| prophet_class | VARCHAR | stellar / profit / breakeven / loss / disaster |
| prophet_confidence | DECIMAL | 0–100 |
| prophet_mape | DECIMAL | model error %, lower = better |
| prophet_lower_interval | DECIMAL | 95% CI lower bound |
| prophet_upper_interval | DECIMAL | 95% CI upper bound |
| updated_at | TIMESTAMP | when this prediction was last written |

### `stock_news_signals` (optional — show if present, hide if not)
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| ticker | VARCHAR | FK to stock_predictions.ticker |
| signal_1d | DECIMAL | bullish probability 0–1 for 1-day horizon |
| signal_2d | DECIMAL | bullish probability 0–1 for 2-day horizon |
| signal_3d | DECIMAL | bullish probability 0–1 for 3-day horizon |
| updated_at | TIMESTAMP | |

> NOTE: Update column names above once backend team shares the actual schema.

---

## Env Vars to Add

```
SQL_CONNECTION_STRING=   # connection string for the SQL DB (backend team provides)
REVALIDATE_SECRET=       # random string shared with backend for cache invalidation webhook
```

---

## Files to Create / Modify

### DB Client (new)
- `lib/sql.ts` — SQL client singleton (e.g. using `postgres`, `mysql2`, or `@vercel/postgres`
  depending on which SQL flavour backend uses — TBD)

### API Routes (new)
- `app/api/stocks/predictions/route.ts`
  - GET all predictions sorted by `prophet_monthly_return` DESC
  - Joins `stock_news_signals` if table exists
  - Auth: session must have `section === 'stocks'`
  - Next.js cache tag: `'stock-predictions'`, revalidate 3600s

- `app/api/stocks/predictions/[ticker]/route.ts`
  - GET single ticker — prediction + news signals
  - Same auth + cache tag

- `app/api/revalidate/route.ts`
  - POST endpoint called by backend after each prediction run
  - Validates `?secret=REVALIDATE_SECRET`
  - Calls `revalidateTag('stock-predictions')` to purge Vercel cache
  - Returns 200 on success, 401 on bad secret

### Pages (replace / new)
- `app/(stocks)/stocks/page.tsx` — replace "coming soon"
  - Server component, fetches all predictions (cached)
  - Renders `<SummaryCards>` + `<PredictionTable>`

- `app/(stocks)/stocks/[ticker]/page.tsx` — new
  - Server component, fetches single ticker prediction (cached)
  - Renders `<StockDetailCard>` + `<NewsSentimentCard>`

### Components (new — `components/stocks/`)
- `prediction-badge.tsx` — color-coded class badge
  - stellar → gold/yellow
  - profit → green
  - breakeven → gray
  - loss → orange
  - disaster → red

- `summary-cards.tsx` — 4 stat cards
  - Total Picks | Stellar Count | Profit Count | Avg Confidence

- `prediction-table.tsx` — client component
  - Filter tabs: All | Stellar | Profit | Breakeven | Loss | Disaster
  - Sort: Return % | Confidence | MAPE
  - Search: by ticker name
  - Columns: Ticker | Return % | Predicted Price | Class | Confidence | MAPE
  - Row click → `/stocks/[ticker]`

- `stock-detail-card.tsx`
  - Current Price → Predicted Price (with arrow)
  - Monthly Return % (large, color-coded)
  - Confidence ring/gauge
  - Price interval bar: lower ——— predicted ——— upper
  - MAPE accuracy label

- `news-sentiment-card.tsx`
  - Hidden if no news signal data
  - 1-Day / 2-Day / 3-Day bullish probability as labeled progress bars

### Existing files to modify
- `components/app-shell.tsx`
  - Add "Predictions" nav link to stocks section
  - (Currently only has "Budget" placeholder which can be removed or renamed)

---

## UI Flow

```
/stocks
  ├── SummaryCards [Total | Stellar | Profit | Avg Confidence]
  └── PredictionTable
        ├── [All] [Stellar] [Profit] [Breakeven] [Loss] [Disaster]
        ├── Sort: Return % ▼
        ├── Search: "RELIANCE..."
        └── Rows → click → /stocks/RELIANCE.NS

/stocks/RELIANCE.NS
  ├── ← Back to Predictions
  ├── StockDetailCard
  │     ├── ₹2,450  →  ₹2,680  (+9.4%)
  │     ├── Confidence: 74/100
  │     ├── Interval: ₹2,310 ——●—— ₹2,950
  │     └── MAPE: 8.2% (Good)
  └── NewsSentimentCard (if data)
        ├── 1-Day  ████████░░  78% bullish
        ├── 2-Day  ██████░░░░  62% bullish
        └── 3-Day  █████░░░░░  51% bullish
```

---

## Cache Invalidation Flow (no Ably needed)

```
Python script finishes writing to SQL
  └── HTTP POST https://mcube.studio/api/revalidate?secret=xxx
        └── Next.js calls revalidateTag('stock-predictions')
              └── Vercel purges cached predictions
                    └── Next request to /stocks fetches fresh data from SQL
```

For **PWA push notifications** (future): backend calls `/api/notify` endpoint which sends
Web Push messages to subscribed users. No Ably / WebSocket service needed.

---

## Verification Steps

1. Backend team seeds a few rows into `stock_predictions` SQL table
2. `GET /api/stocks/predictions` returns data (test logged in as stocks user)
3. Dashboard summary cards show correct counts
4. Filter tabs work client-side (no network calls on click)
5. Clicking a row navigates to `/stocks/[ticker]` — detail renders
6. News sentiment section appears when `stock_news_signals` has data, hidden otherwise
7. Backend calls `/api/revalidate?secret=xxx` → data refreshes on next page load
8. Vercel deployment: env vars `SQL_CONNECTION_STRING` and `REVALIDATE_SECRET` set in project settings

---

## Out of Scope for This Phase

- Historical price chart (needs backend endpoint or Yahoo Finance integration)
- CSV upload UI
- PWA push notification subscription management
- Personal watchlist / portfolio tracking
- Triggering prediction runs from the UI
