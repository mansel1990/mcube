# API Routes

All routes are under `app/api/`. All swing strategy routes query the `swing` schema in Neon Postgres using the `sql` tagged template from `lib/sql.ts`.

## Swing strategy signal routes

| Route | File | Query |
|---|---|---|
| `GET /api/stocks/swing/breakout` | `app/api/stocks/swing/breakout/route.ts` | `SELECT * FROM swing.signals WHERE date = CURRENT_DATE ORDER BY volume_ratio DESC` |
| `GET /api/stocks/swing/ema-pullback` | `app/api/stocks/swing/ema-pullback/route.ts` | `SELECT * FROM swing.ema_signals WHERE date = CURRENT_DATE ...` |
| `GET /api/stocks/swing/vcp` | `app/api/stocks/swing/vcp/route.ts` | `SELECT * FROM swing.vcp_signals WHERE date = CURRENT_DATE ...` |
| `GET /api/stocks/swing/rs-resilience` | `app/api/stocks/swing/rs-resilience/route.ts` | `SELECT * FROM swing.rs_signals WHERE date = CURRENT_DATE ...` |
| `GET /api/stocks/swing/mean-reversion` | `app/api/stocks/swing/mean-reversion/route.ts` | `SELECT * FROM swing.mean_reversion_signals WHERE date = CURRENT_DATE ...` |

## Performance route

`GET /api/stocks/swing/performance`  
File: `app/api/stocks/swing/performance/route.ts`

Returns:
```json
{
  "trades": [ /* all rows from swing.strategy_performance, newest first */ ],
  "stats": [
    {
      "strategy": "ema_pullback",
      "total_trades": 12,
      "closed_trades": 7,
      "open_trades": 5,
      "wins": 4,
      "losses": 2,
      "total_pnl": 680.00,
      "avg_pnl": 97.14,
      "best_trade": 480.00,
      "worst_trade": -245.00,
      "avg_pnl_pct": 4.8
    }
    /* one entry per strategy that has data */
  ]
}
```

## Other stocks routes

| Route | Purpose |
|---|---|
| `GET /api/stocks/notifications` | Push notification history (MongoDB) |
| `GET /api/stocks/current-price` | Real-time price fetch |
| `GET /api/stocks/ohlcv` | OHLCV data for chart page (queries `stocks.daily_ohlcv`) |
| `GET /api/stocks/tickers` | Distinct tickers from `stocks.daily_ohlcv` |
| `GET /api/stocks/suggestions` | Suggestions for "Manish Logic" page |

## Adding a new swing API route

1. Create `app/api/stocks/swing/<name>/route.ts`
2. Copy the pattern from any existing route, change the table name
3. No auth check needed in the route — the `(stocks)` layout already authenticated the user before the page fetches the API. The API routes themselves don't re-authenticate (they're called client-side from the already-authenticated session).

## Mansel Live

`/api/mlive/*` is a separate book. Every route checks the stocks admin session (`lib/mlive/auth.ts`). The browser never places an order.

| Route | Purpose |
|---|---|
| `GET /api/mlive/home` | Home payload |
| `GET /api/mlive/charts` | Equity series |
| `GET /api/mlive/reports/ledger` | Daily reports |
| `GET /api/mlive/reports/alerts` | Alerts |
| `GET /api/mlive/reports/audit` | Audit log |
| `GET /api/mlive/reports/csv` | Ledger CSV |
| `GET/POST /api/mlive/settings` | Read settings, change an allow-listed key |
| `POST /api/mlive/approvals` | Approve or skip a proposed decision |
| `POST /api/mlive/fund` | Deposit or withdrawal. Moves the breaker peak |
| `POST /api/mlive/state` | Pause, resume, or set mode |
| `GET /api/mlive/kite/login` | Redirect to Kite |
| `GET /api/mlive/kite/callback` | Store the encrypted token in `mlive.mlive_kite_sessions` |
| `POST /api/mlive/kite/disconnect` | Delete this user's session row |
| `POST /api/mlive/alerts/:id/seen` | Mark an alert seen |
| `POST /api/mlive/push` | Engine push. Header `x-mlive-secret` |

Orders are placed by `engine/` on the server, not by these routes.

## Env vars needed
| Var | Used by |
|---|---|
| DATABASE_URL | `lib/sql.ts` — Neon Postgres |
| MONGODB_URI | `lib/auth.ts` — MongoDB Atlas |
| AUTH_SECRET | `lib/auth.ts` |
| BETTER_AUTH_URL | `lib/auth.ts` |
| NEXT_PUBLIC_APP_URL | `lib/auth.ts` |
| KITE_API_KEY, KITE_API_SECRET | Mansel Live Kite login |
| MLIVE_TOKEN_KEY | Encrypts the Kite token (web and engine must share it) |
| MLIVE_USER_ID | Optional pin of the Sanjay Mongo user id |
| MLIVE_PUSH_SECRET | Engine push header. Falls back to CRON_SECRET |
| VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY | Web push |
