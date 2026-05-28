# Performance Tracking

## Overview
Every signal saved to the DB is also logged as a **simulated ₹10,000 position** in `swing.strategy_performance`. The scanner evaluates open positions at each run and closes them based on target/SL/timeout logic.

## Data flow

```
Scanner run (python main.py --save)
  │
  ├─ performance.evaluate_open_positions()
  │     ├─ Fetch all rows WHERE status = 'open'
  │     ├─ Download today's OHLC for those symbols
  │     └─ For each open position:
  │           if high >= target_price  → close as "target_hit"  at target_price
  │           if low  <= stop_loss     → close as "stop_loss"    at stop_loss
  │           if days_held >= 7        → close as "timeout"      at today's close
  │           else                    → print "still open (day N)"
  │
  └─ performance.log_new_signals(signals, strategy_name)
        └─ INSERT INTO strategy_performance for each signal
           (skip if (signal_date, symbol, strategy) already exists)
```

## Exit logic
| Reason | Trigger | Exit price |
|---|---|---|
| `target_hit` | next-day high ≥ target_price | target_price |
| `stop_loss` | next-day low ≤ stop_loss_price | stop_loss_price |
| `timeout` | 7+ calendar days elapsed, no hit | today's close |

## Performance page (`app/(stocks)/stocks/performance/performance-client.tsx`)

### Strategy tabs
All 5 strategies have colored filter tabs:
- Breakout → violet
- EMA Pullback → emerald
- VCP → purple
- RS Resilience → rose
- Mean Reversion → teal

### KPI cards (4)
- Total P&L (₹)
- Win Rate (%)
- Best single trade (₹)
- Avg P&L per trade (₹ + %)

### Charts
- Cumulative P&L line chart (sorted by exit_date)
- Per-trade P&L bar chart (green = win, red = loss)
- Outcomes by strategy horizontal bar chart (Wins / Losses / Timeout) — shown only when "All" tab active

### Trade history table
Columns: Date | Symbol | Strategy badge | Entry | Target | SL | Exit reason badge | P&L

### `STRATEGY_META` (in performance-client.tsx)
Maps strategy DB name → display label + colors. Must be updated if a new strategy is added:
```typescript
const STRATEGY_META = {
  breakout:       { label: "Breakout",       color: "text-violet-700",  bg: "bg-violet-50",  ... },
  ema_pullback:   { label: "EMA Pullback",   color: "text-emerald-700", bg: "bg-emerald-50", ... },
  vcp:            { label: "VCP",            color: "text-purple-700",  bg: "bg-purple-50",  ... },
  rs_resilience:  { label: "RS Resilience",  color: "text-rose-700",    bg: "bg-rose-50",    ... },
  mean_reversion: { label: "Mean Reversion", color: "text-teal-700",    bg: "bg-teal-50",    ... },
};
```

## API route (`app/api/stocks/swing/performance/route.ts`)
Returns both raw trades and per-strategy aggregated stats in a single response:
```json
{
  "trades": [...],
  "stats": [
    { "strategy": "ema_pullback", "total_trades": 5, "wins": 3, "losses": 1, "total_pnl": 450, ... }
  ]
}
```
