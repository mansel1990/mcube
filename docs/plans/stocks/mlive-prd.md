# PRD — Mansel Live (`mlive`): automated live trading on Zerodha Kite

**Owner:** Sanjay · **Written:** 5 Nov 2026 · **Status:** ready to build
**UI mockup:** [`docs/plans/stocks/mockups/mlive-ui-mockup.html`](./mockups/mlive-ui-mockup.html). Open it in a browser. It's the target look and layout.
**Rules doc (human-readable):** "Mansel Live — Trading Rules & System" (Claude Docs). This PRD carries the same rules in build detail.
**Server notes:** [`docs/plans/stocks/server-setup-2026-11-05.txt`](./server-setup-2026-11-05.txt)

---

## 1. Summary

Build a separate live-trading system, **Mansel Live** (code name `mlive`). It trades real money in Sanjay's Zerodha account, using the two strategies that did best in paper trading: **RS Resilience** and **EMA Pullback**.

- It manages only its own fund (₹80,000 to start, plus realised profit) and only the positions it opened.
- Every buy and sell passes hard rules: sizing, cash, daily limits, circuit breaker, and "do nothing on bad data".
- Every action is written to an audit log, and anything important sends an alert.
- It runs in **Approve each** mode first, and **Fully automatic** later.
- The existing `/stocks` paper demo keeps running but **loses all Kite features**. Kite lives only in the new system.

### Goals
1. Place, track and exit live trades automatically within fixed rules that code enforces.
2. Never touch money or holdings that aren't the system's (for example NIFTYBEES).
3. Make Sanjay's action items obvious, and everything else visible: holdings, buys, sells, ideas and reasons.
4. Keep a complete, replayable record: audit log, ledger, alerts.

### Non-goals
- Intraday trading, F&O, margin, short selling.
- Using an LLM to decide trades. Decisions are deterministic code; an LLM may write the plain-English report.
- Reusing or changing the paper tables (`swing.*`, `sim.*`, `daily_suggestor.*`). They stay as they are for the demo.

---

## 2. Background and decisions already made

| Topic | Decision |
|---|---|
| Strategies | RS Resilience and EMA Pullback only. Live paper results: RS 75 trades, +₹9,894, +1.32% per trade; EMA 109 trades, +₹8,736, +0.80% per trade. All others dropped. |
| Exits | **No fixed +4%/+6% target and no 7-day timeout.** Exit when the trend breaks on a daily close; tighten the stop after a new 52-week high. Exact numbers come from a backtest (section 7.5). |
| Broker | Zerodha Kite Connect **Personal plan (free)**: orders, GTT, portfolio. No market data from Kite. |
| Static IP | Orders must come from a whitelisted static IP (SEBI retail-algo rules, from 1 Apr 2026). Server `mcube-server` (DigitalOcean BLR1) has Reserved IP **139.59.51.34**; the droplet's own IP is **159.65.159.127**. Both are whitelisted in the Kite developer profile. The whitelist can change only once per calendar week. |
| Order rate | Far below 10 orders per second, so no exchange algo registration is needed. Orders are tagged (section 5.3). |
| Prices | Daily OHLCV from the NSE bhavcopy into `stocks.daily_ohlcv` (job on the server, 19:30 IST, simple 14-day RSI). Live prices on the page come from Yahoo (`yahoo-finance2`), as today. |
| Kite login | Kite tokens expire every day, so Sanjay logs in each morning. Never automate the login (no TOTP bots). |
| Inspiration | The video "I Built an AI Agent That Trades Stocks" (The Tech Girl). Borrowed: approvals on at first; frozen rulebook; max order 25%; daily trade cap; no margin or shorting; bad data → do nothing; 25% drawdown circuit breaker with manual restart; a ledger read first and written last; "if unsure, do nothing"; a daily report; a 60-day strategy review. |

---

## 3. System overview

```
                 Vercel (mcube Next.js)                     DigitalOcean mcube-server (static IP)
 ┌────────────────────────────────────────────┐      ┌──────────────────────────────────────────────┐
 │ /live-trade-mansel UI (Home/Charts/        │      │ 18:00  scanner (swing-trade, UNCHANGED)       │
 │   Reports/Settings)                        │      │        → swing.rs_signals / swing.ema_signals │
 │ /api/mlive/*  read mlive.*, write          │◀────▶│ 18:20  engine import-ideas → mlive_ideas      │
 │   approvals/settings                       │ Neon │ 19:30  bhavcopy prices → stocks.daily_ohlcv   │
 │ /api/mlive/kite/login + callback           │  PG  │ engine (TypeScript, mcube/engine): orders,    │
 │   → mlive_kite_sessions (encrypted)        │      │   GTTs, EOD, alerts — DIRECT from static IP   │
 │ web push (existing VAPID setup)            │      └──────────────────────────────────────────────┘
 └────────────────────────────────────────────┘
```

**Everything new is built in the mcube repo.** The web app, migrations and engine all live there. The engine runs on the server from a clone of mcube, as the relay does today. The `swing-trade` scanner keeps running unchanged as the idea source.

**Key design choice:** the web app never places orders. It only writes **intents**: approvals, settings, pause and resume. All order placement happens in the engine on the server. This keeps one choke point for the rules, and every order leaves from the whitelisted IP. Calls that don't need the static IP (holdings, margins, order book) may also come from the engine, so there's one Kite client.

---

## 4. Users, modes and states

- **Single user:** Sanjay (stocks section user). Only this user may open `/live-trade-mansel` or call `/api/mlive/*`. Check by user id, not just by section.
- **Modes** (in `mlive_state.mode`):
  - `approve` (default): the engine proposes, and nothing is sent until Sanjay taps Approve.
  - `auto`: proposals that pass every rule are sent at their scheduled time.
  - `paused`: no new orders. Existing GTT stops in Kite stay active.
- **Engine status** (`mlive_state.status`): `active`, `paused_by_user`, `paused_by_breaker`, `halted_today` (a do-nothing condition hit today; clears the next morning).
- **Dry run** (`mlive_settings.dry_run`, default **true** until go-live): the engine runs every step but writes `DRY` orders instead of calling Kite. Used for the first week.

---

## 5. Rules (build exactly these)

All numbers are settings (section 6.1). Changes take effect at the next morning run.

### 5.1 Money

- **Fund** = sum of `mlive_fund_ledger` = money put in − money taken out + realised P&L after charges (losses reduce it). It starts at ₹80,000. If profit takes it to ₹81,000, all ₹81,000 is usable.
- **System cash** = fund − cost basis of open system positions − value of buy orders still pending.
- **Kite cash** = Kite equity available cash, read just before each buy step.
- **Spendable** = min(system cash, Kite cash) − cash reserve (₹500).
  - If Kite cash is lower than system cash, for example because Sanjay bought NIFTYBEES, the engine buys less and raises a **Problem** alert ("Kite cash below system cash by ₹X").
- **Adding or withdrawing money:** Sanjay enters it in Settings, and it's written to `mlive_fund_ledger` as `deposit` or `withdrawal`. A withdrawal below the invested amount blocks new buys until sales bring it under. The engine never sells to free money.
- **Sale proceeds:** after the sell step, wait for fills, then re-read Kite cash. Don't assume what share of a sale Kite releases the same day.

### 5.2 Position sizing

```
risk_budget = risk_pct × fund                      # 1% → ₹807 at ₹80,740
qty_risk    = floor(risk_budget / (entry − initial_stop))
qty_cap     = floor(max_order_pct × fund / entry)   # 25%
qty_cash    = floor(spendable_now / entry)
qty         = min(qty_risk, qty_cap, qty_cash)
skip if qty < 1  or  qty × entry < min_order (₹8,000)  → reason "too small" / "no funds"
```

- `entry` = the limit price (signal close × 1.005, rounded to the tick).
- `initial_stop` = the trend stop on the signal day, from the exit rule (section 7.5).
- Never add to a position the system holds, and never average down.
- `max_open_positions` = 6 and `max_per_sector` = 2 also apply.
- Store the full sum in `mlive_decisions.sizing` (JSON) and show it in the audit log, for example "risk ₹807 ÷ (2065−1978) = 9 · cap 9 · cash 14 → 9".

Worked examples (must pass as unit tests, fund ₹80,000, risk ₹800, cap ₹20,000):

| Entry | Stop | Spendable | Expected |
|---|---|---|---|
| 2,065 | 1,978 | 50,000 | 9 shares |
| 3,718 | 3,480 | 50,000 | 3 shares |
| 1,952 | 1,915 | 50,000 | 10 shares (cap) |
| 2,065 | 1,978 | 10,708 | 5 shares |
| 21,500 | 20,600 | 50,000 | skip: too expensive |
| 2,065 | 1,978 | 7,000 | skip: no funds |

### 5.3 What the system owns

- **Order tag:** every engine order uses Kite's `tag` field (alphanumeric, max 20 characters, per the Kite Connect v3 orders docs). The format is `mlive` + side + short id, for example `mliveB7F3K2`. It's stored in `mlive_orders.tag`.
- GTTs have no tag field, so GTTs are tracked by `trigger_id` in `mlive_gtts`. Orders created by a GTT are linked through the GTT's order result.
- `mlive_positions` is the **source of truth** for system holdings. Kite's holdings list is used only to check against.
- A sell or GTT quantity is never more than `mlive_positions.qty` for that symbol.
- **Exclude list** (setting): starts as `NIFTYBEES` plus every ETF in the instrument list. The system never buys or sells these.
- The system never buys a symbol Sanjay holds outside the system (Kite holding quantity > system quantity at preflight).
- Sanjay's own holdings and trades don't count toward limits, the breaker, the fund or P&L.
- **Morning check** (`mlive_reconciliations`): for each system position, Kite qty ≥ system qty → OK.
  - If Kite qty is less, the position is **frozen**: no engine orders for it. A **Needs you** alert goes out, and the Home page offers "Mark as sold manually" or "Investigate".
  - Anything extra in Kite belongs to Sanjay and is ignored.

### 5.4 Daily limits

- Max **4 engine buys** and max **4 engine sells** per trading day.
- Every order sent counts, filled or not. A cancelled or unfilled order still uses its slot, and there are no retries the same day.
- A partial fill = one trade. Unfilled quantity is cancelled at 15:15.
- **GTT-triggered exits never count and are never blocked.**

### 5.5 Choosing among ideas

1. **Filter out any idea that:**
    - is already held by the system or by Sanjay;
    - is on the exclude list;
    - would make 3 in one sector;
    - has fewer than 20 days of price history;
    - has bad or missing data (section 5.8);
    - opens more than 3% above the signal close (chasing check at the buy step);
    - is under `min_order` after sizing.
2. **Rank:** by the strategy score, normalised to 0–1 within each strategy. RS Resilience comes before EMA Pullback when scores tie, or rank strategies by live per-trade return from `mlive_*`, once there are 20 or more live trades per strategy.
3. **Buy in rank order.** After each buy, recalculate spendable and size the next idea with what's left.
4. Ideas that lose out are logged as `skipped: no_funds` or `skipped: limit` and **are not queued**. An idea is valid only for the session after its scan.
5. **Sector source:** the NSE index constituent files (for example `ind_nifty200list.csv`, "Industry" column), cached in `mlive_instruments` and refreshed monthly.

### 5.6 Exits

- **Trend stop:** recalculated on each daily close, and it only moves up. A close below it creates a sell for 09:20 the next morning.
- **New 52-week high:** no tightening. The backtest showed it didn't help (section 7.5). Keep the setting so the 60-day review can switch it on.
- **Hard stop in Kite:** a single-leg GTT SELL placed when the buy fills.
  - Quantity = system qty. Trigger = trend stop × (1 − gtt_gap). Limit = trigger − 0.5% (tick-rounded).
  - The engine **modifies** it whenever the trend stop rises.
  - If the GTT can't be placed within 10 minutes of the fill, a **Problem** alert goes out, and the position is sold at market-protected limit before 15:15.
- No profit target and no time-based exit.

### 5.7 Circuit breaker

- **System value** = system cash + market value of system positions, at the daily close.
- **Peak** = the highest system value. A deposit raises the peak by the same amount, and a withdrawal lowers it.
- If system value ≤ (1 − 25%) × peak, status becomes `paused_by_breaker`, a **Problem** alert goes out, and no new orders are sent until Sanjay resumes in Settings. GTTs stay active.

### 5.8 Do nothing today (status `halted_today`, Problem alert)

The engine places no orders that day if any of these happen:

- `mlive_state` or the ledger can't be read, or yesterday's end-of-day write is missing.
- There's no valid Kite session by 09:10. That's a **Needs you** alert at 08:30, and again at 09:00.
- Kite holdings or margins can't be read.
- A reconciliation mismatch (only the affected symbol is frozen; the rest may go on).
- Today's bhavcopy for the previous session is missing from `stocks.daily_ohlcv`.
- For any symbol the engine wants to trade, one of these is true (only that symbol is skipped):
    - Yahoo's previous close differs from the bhavcopy close by more than 2%;
    - the live price differs from the last close by more than 20% without a matching corporate action;
    - the day's volume is 0.

  Kite Personal gives no quotes, so prices are checked between Yahoo and NSE.
- An order is rejected with an unknown reason. That halts the rest of the day.

### 5.9 Always on

- Product `CNC` only, `LIMIT` orders only, and BUY only from cash. No margin, no shorting.
- One decision → one order with a unique tag. Retrying with the same decision id must not place a second order.
- **Order guard:** a single function every order passes through. It re-checks the cap, limits, exclude list, owned qty and mode right before calling Kite, and it is unit-tested on its own.
- **Kill switch:** Pause on Home sets `paused_by_user` at once. The engine checks status before every order.

---

## 6. Data model — schema `mlive`, every table prefixed `mlive_`

Only these shared tables are read, never written: `stocks.daily_ohlcv` (prices), `swing.rs_signals` and `swing.ema_signals` (scanner output, copied nightly into `mlive_ideas`). Nothing in `swing.*`, `sim.*` or `public.kite_sessions` is written. All timestamps are `timestamptz`; all money is `numeric(14,2)`.

| Table | Key columns |
|---|---|
| `mlive_settings` | `key` PK, `value` jsonb, `updated_at`, `updated_by` |
| `mlive_settings_history` | id, key, old_value, new_value, changed_at, changed_by |
| `mlive_fund_ledger` | id, ts, kind (`deposit`/`withdrawal`/`realised_pnl`/`charges`), amount (signed), ref_order_id, note |
| `mlive_state` | single row: status, mode, peak_value, peak_date, last_eod_date, last_run_id, updated_at |
| `mlive_kite_sessions` | user_id PK, access_token_enc, token_date, connected_at |
| `mlive_instruments` | symbol PK, isin, name, sector, is_etf, excluded bool, updated_at |
| `mlive_runs` | id, kind (`preflight`/`sells`/`buys`/`approvals`/`cancel`/`eod`/`import_ideas`), started_at, finished_at, status, summary jsonb |
| `mlive_ideas` | id, scan_date, valid_for, symbol, strategy (`rs`/`ema`), score, signal_close, initial_stop, sector, raw jsonb; unique (scan_date, symbol, strategy) |
| `mlive_decisions` | id, run_id, trade_date, idea_id null, position_id null, side, symbol, outcome (`proposed`/`approved`/`skipped`/`sent`/`expired`), reason_code, reason_text, sizing jsonb, rank |
| `mlive_approvals` | id, decision_id, action (`approve`/`skip`), by_user, ts |
| `mlive_orders` | id, decision_id, tag unique, kite_order_id, side, symbol, qty, limit_price, status, filled_qty, avg_price, placed_at, updated_at, reject_reason, dry_run bool |
| `mlive_fills` | id, order_id, kite_trade_id unique, qty, price, ts |
| `mlive_positions` | id, symbol, strategy, qty, avg_price, opened_at, closed_at null, trend_stop, high_52w_flag, frozen bool, realised_pnl, charges |
| `mlive_gtts` | id, position_id, kite_trigger_id, trigger_price, limit_price, qty, status, created_at, history jsonb |
| `mlive_equity_daily` | trade_date PK, cash, positions_value, system_value, peak, drawdown_pct |
| `mlive_daily_reports` | trade_date PK, decision_summary, text, created_at |
| `mlive_reconciliations` | id, run_id, symbol, system_qty, kite_qty, result (`ok`/`missing`/`extra_ignored`) |
| `mlive_alerts` | id, ts, level (`needs_you`/`problem`/`done`), code, message, symbol, push_sent bool, seen_at |
| `mlive_audit_log` | id, ts, actor (`engine`/`user`/`kite`/`system`), action, symbol, before jsonb, after jsonb, reason, run_id — **append-only** (revoke UPDATE/DELETE for the app role) |
| `mlive_holidays` | trade_date PK, name (NSE trading holidays, seeded yearly) |
| `mlive_backtests` | id, run_at, params jsonb, metrics jsonb, chosen bool |

- Migrations are SQL files in `mcube/scripts/sql/mlive/` (numbered `001_init.sql` …). Both apps read the same schema.
- The access token is encrypted with `MLIVE_TOKEN_KEY` (AES-GCM), set on Vercel and on the server.

### 6.1 Settings (`mlive_settings` defaults)

| key | default |
|---|---|
| `risk_pct` | 0.01 |
| `max_order_pct` | 0.25 |
| `min_order_inr` | 8000 |
| `cash_reserve_inr` | 500 |
| `max_buys_per_day` | 4 |
| `max_sells_per_day` | 4 |
| `max_open_positions` | 6 |
| `max_per_sector` | 2 |
| `breaker_pct` | 0.25 |
| `chase_pct` | 0.03 |
| `limit_offset_pct` | 0.005 |
| `exclude_symbols` | ["NIFTYBEES"] + all ETFs |
| `strategies_enabled` | ["rs","ema"] |
| `mode` | "approve" |
| `dry_run` | true |
| `exit.rs` | `{"trend_stop_rule":"chandelier","atr_period":14,"atr_mult":2.5,"tighten_after_52w":0,"gtt_gap_pct":0.03}` |
| `exit.ema` | `{"trend_stop_rule":"close_below_ema","ema_period":20,"tighten_after_52w":0,"gtt_gap_pct":0.03}` |
| `review_every_days` | 60 |

The initial `mlive_fund_ledger` row is a deposit of 80,000.

---

## 7. Engine (new, TypeScript, in the mcube repo under `engine/`)

### 7.1 Placement and runtime
- Source: `mcube/engine/` (TypeScript, Node 20). It shares `lib/mlive/*` types and rule functions with the web app. It uses `kiteconnect` (already a dependency) and `@neondatabase/serverless` or `pg`, and runs with `tsx` or as compiled JS.
- Runs on mcube-server from `/opt/mcube-src/mcube` (the clone the relay already uses). Deploy is `git pull && npm ci && npm run engine:build`.
- Tests: vitest, with `npm run engine:test`.
- Env file: `/etc/mcube/mlive.env` with `DATABASE_URL`, `KITE_API_KEY`, `KITE_API_SECRET`, `MLIVE_TOKEN_KEY`, `VAPID_*` (or a webhook to mcube for push).
- Driven by cron (IST), with a file lock so runs never overlap. Each run writes `mlive_runs` and audit rows.

### 7.2 Daily schedule (trading days from `mlive_holidays`)

| IST | Job | Does |
|---|---|---|
| 18:00 | scanner (swing-trade, unchanged) | Writes RS and EMA signals to `swing.rs_signals` / `swing.ema_signals`, as today |
| 18:20 | `import-ideas` | Copies today's RS and EMA rows into `mlive_ideas` (valid for the next session). Adds a normalised score, sector, and the initial stop from the exit rule on `stocks.daily_ohlcv`. If no scanner rows exist by 18:40, a Problem alert goes out. |
| 19:30 | bhavcopy | Prices → `stocks.daily_ohlcv` (exists) |
| 19:45 | `eod-stops` | Recalculate trend stops from the new close. Create sell proposals for closes below the stop. Mark 52-week highs. |
| 08:30 | `remind` | Needs-you push if there's no Kite session today |
| 08:35–09:10, every 5 min | `preflight` | Session, ledger, reconciliation, data checks, then proposals for buys and sells. Writes the morning report draft. |
| 09:20 | `sells` | Send approved (or, in auto mode, all) sell proposals, up to 4 |
| 09:40 | `refresh` | Poll fills, update positions, re-read Kite cash, place or modify GTTs |
| 09:45 | `buys` | Chasing check against the live price, final sizing, guard, send up to 4. GTT after each fill. |
| 09:46–14:30, every 1 min | `approvals` | Send late approvals immediately. Expire anything left at 14:30. |
| every 5 min, market hours | `sync` | Poll the order book and GTTs. Fills → `mlive_fills` and `mlive_positions`. GTT triggered → close the position. |
| 15:15 | `cancel` | Cancel unfilled engine orders |
| 15:45 | `eod` | Equity, peak, breaker check, realised P&L to the fund ledger, final daily report, Done alert |

### 7.3 Charges
Use the Kite order-charges API if it's available on the Personal plan (check during the build). Otherwise use a formula module with settings for STT, exchange charges, SEBI, stamp duty, GST and the flat DP charge per sell. Record charges on positions and in the fund ledger.

### 7.4 Engine modules
- `rules.ts`: pure functions for sizing, filters, ranking, limits and the breaker. 100% unit-tested with the examples in this PRD.
- `guard.ts`: the last-line order guard (section 5.9).
- `kite.ts`: a thin wrapper over the `kiteconnect` Node client, with retries for safe reads only and none for order placement.
- `jobs/*.ts`: one file per scheduled job, each runnable with `npm run engine -- <job>`.
- `audit.ts` and `alerts.ts`.

### 7.5 Exit parameters (backtest result, 5 Nov 2026)

**Chosen:** a different trend stop for each strategy, the GTT 3% below it, and **no** tightening after a 52-week high.

| Setting | RS Resilience | EMA Pullback |
|---|---|---|
| `exit.trend_stop_rule` | Chandelier: highest close since entry − 2.5 × ATR(14), only moves up | Daily close below the 20-day EMA |
| `exit.tighten_after_52w` | none | none |
| `exit.gtt_gap_pct` | 3% below the trend stop | 3% below the trend stop |
| Initial stop (for sizing) | the same rule on the signal day | the 20-day EMA on the signal day. If the entry is below it, skip the idea. |

**How it was tested:**
- Entries: the paper `swing.strategy_performance` trades. RS: 73 usable, signals 20 May – 3 Jul 2026. EMA: 89–100 usable, signals 14 May – 4 Nov 2026.
- Prices: `stocks.daily_ohlcv`. Trades whose signal close differed from the price table by more than 3% were dropped.
- Entry at the next day's open, skipped if more than 3% above the signal close.
- Charges: 0.24% plus a ₹15.93 DP charge on a ₹15,000 position.
- Compared 22 exit variants per strategy:
    - trend stop: 10-day low, 20-day EMA, or ATR chandelier at 2.5 or 3;
    - tightening after a 52-week high: none, 0.5 or 1;
    - GTT gap: 1%, 2% or 3%.

| Result (net per trade, after charges) | Old fixed target/stop, 5 days | Chosen rule |
|---|---|---|
| RS Resilience | −0.36% · PF 0.81 · 75 trades | **+0.26%** · PF 1.07 · win 33% · worst −11.7% · ~27 days held |
| EMA Pullback | −0.49% · PF 0.67 · 102 trades | **+1.68%** · PF 1.63 · win 43% · worst −33.3% · ~25 days held |

**Findings:**
- Trend exits beat the fixed target for both strategies.
- The best rule differs by strategy. The 20-day EMA is the best stop for EMA Pullback but the worst for RS (−1.1% to −1.5% per trade).
- Tightening after a 52-week high never helped, so it's off.
- A 3% GTT gap beat 1–2%: fewer stop-outs on dips that recovered (5–9% of trades, against 19–35% at a 1% gap).

**Limits (read before trusting):**
- Small samples (about 75–100 trades per strategy) from one six-month period.
- RS only has May–July data, because the scanner was down after 3 July.
- Results won't match the paper P&L figures, which used Yahoo prices, no charges and the old exits.
- EMA's worst trade (−33%) was an overnight gap. With 1% risk sizing, a gap like that on a full ₹20k position costs about 8% of the fund. The breaker, the 25% cap and the 6-position limit are the guard.
- **Re-run this at the 60-day review** with live `mlive_*` trades, and over a longer history once the scanner is backfilled.

---

## 8. Web app (mcube)

### 8.1 Routes (match the mockup)

| Route | Content |
|---|---|
| `/live-trade-mansel` | **Home:** status pills (engine, mode, Kite, breaker); hero account value and sparkline; cash, invested, buys/sells today (x/4 · x/4), fund used; **Needs you** card with Approve/Skip; **What we hold** cards (P&L, qty/avg/LTP, a bar from trend stop to 52-week high, GTT status); **What we bought and sold** timeline; **Last night's ideas** (counts, and per idea strategy → result + reason) |
| `/live-trade-mansel/charts` | Account value vs peak (line + dashed peak), down-from-peak with the 25% breaker line, profit by strategy. Live money only. |
| `/live-trade-mansel/reports` | Summary tiles; daily ledger (including "No action" days); Alerts list; Audit log (filterable, paginated); CSV download |
| `/live-trade-mansel/settings` | Trading mode (Approve each / Fully automatic / Paused); Kite connection (connect, disconnect, session time, static IP, engine health); Fund (money in or out entry, current fund); Rules (all section 6.1 settings); Exit rules (read-only until the backtest sets them); Strategies on/off with the next review date; Resume after breaker |

- **Design:** the mockup's tokens. Dark default and a light theme. Inter for text, JetBrains Mono for numbers. Red brand `#F0443A` (dark) / `#D92D20` (light), used **only** for Needs-you items and primary buttons. Strategy colours RS `#7A83F5`/`#4F5BD5` and EMA `#C17F22`/`#C77A12` (checked for colour-blind readers). Profit and loss shown in green and red, always with + or −.
- Its own layout under `app/(mlive)/live-trade-mansel/`. Don't use the DOTA theme shell.
- Mobile: a bottom navigation bar, as in the mockup.
- Charts: Recharts (already a dependency) or hand-rolled SVG, with hover tooltips.

### 8.2 API (`app/api/mlive/*`, auth: Sanjay's user only)
- `GET home`, `GET charts?range=`, `GET reports/ledger|alerts|audit` (paginated), `GET settings`.
- `POST approvals` {decision_id, action}: the web only writes the approval row and an audit row.
- `POST settings` (validated; writes history and audit).
- `POST fund` {kind, amount}.
- `POST state` {mode | pause | resume}.
- `GET kite/login`, `GET kite/callback`: saves the encrypted token to `mlive_kite_sessions`.
  - **Change the redirect URL in the Kite developer console** to `https://mcubetechstudio.com/api/mlive/kite/callback`.
- `POST alerts/:id/seen`.
- Push: reuse the existing VAPID web-push setup. The engine triggers pushes through a secured `POST /api/mlive/push` (secret header), or sends web push itself.

---

## 9. Remove Kite from `/stocks` (paper demo keeps running)

Delete or strip out all of these, and make sure `/stocks` builds and works without Kite:

- **UI:**
    - `components/stocks/kite-status-banner.tsx`, and its use in `app/(stocks)/layout.tsx`;
    - `components/stocks/kite-order-toast.tsx`;
    - `components/stocks/swing/kite-trade-actions.tsx`, and its use in `unified-signal-card.tsx` and `unified-signals-page.tsx`;
    - `components/stocks/settings/kite-settings-card.tsx`, and its entry in `settings-nav.tsx` and `stocks/settings/page.tsx`;
    - the Kite parts of `components/stocks/portfolio/*`;
    - Kite references in `components/app-shell.tsx` and `dota-shell.tsx`.
- **API:**
    - `app/api/kite/*`: login, callback, disconnect, holdings, order, order cancel, orders, portfolio-summary, positions, status;
    - `app/api/cron/kite-remind`, and its entry in `vercel.json`.
- **Lib:** `lib/kite/*`. Keep only what mlive reuses, moved under `lib/mlive/`.
- **Mongo `user-trade` / Kite sync:** remove the Kite sync paths. Paper-trade logging stays if it's used without Kite.
- **Leave untouched:**
    - `public.kite_sessions` data. Don't drop it in code; Sanjay drops it manually later.
    - The relay on the server. It's no longer called; retiring it is a later decision.
- **Docs:** mark `docs/plans/stocks/kite-integration-*.md` as superseded by this PRD.

---

## 10. Ideas from the scanner (no change to `swing-trade`)

- The `swing-trade` repo and its 18:00 scan stay **unchanged**. The engine's `import-ideas` job (18:20) reads that day's rows from `swing.rs_signals` and `swing.ema_signals`, read-only.
- For each row, it upserts into `mlive_ideas`:
    - `valid_for` = the next trading day;
    - `signal_close` = `cmp`;
    - score = normalised from `signal_strength`, `rsi` and `volume_ratio`;
    - sector from `mlive_instruments`;
    - `initial_stop` worked out by the engine from `stocks.daily_ohlcv` with the exit rule. The scanner's own `stop_loss` and `target` are ignored.
- Symbol format: strip any `.NS` suffix so it matches Kite's `tradingsymbol` and `stocks.daily_ohlcv`.
- Ideas are imported even when the engine is paused; the engine decides.
- Future strategy fixes (EMA volume filter, RS formula) happen in `swing-trade` and reach both paper and live.

---

## 11. Alerts and audit

| Level | Codes (examples) |
|---|---|
| `needs_you` | `kite_login_needed`, `approve_buy`, `approve_sell`, `position_missing_in_kite`, `resume_needed` |
| `problem` | `breaker_tripped`, `bad_data`, `ledger_failed`, `order_rejected`, `gtt_failed`, `kite_cash_low`, `engine_error` |
| `done` | `order_filled`, `gtt_placed`, `gtt_moved`, `stop_fired`, `daily_report` |

- Every alert is a row in `mlive_alerts` and a push notification (respecting a quiet-hours setting); it's also shown on Home and in Reports.
- The audit log covers every job run, check result, decision with reasons and sizing, order, fill, GTT change, setting change, approval, pause, resume and fund entry. It's append-only.

---

## 12. Testing and rollout

1. **Unit tests (vitest):** `rules.ts` and `guard.ts`, with every example and rule in section 5 (sizing table, 4/4 limits, exclusion, ownership, breaker with a deposit, chasing, do-nothing cases).
2. **Dry run (1 week):** `dry_run=true`, mode `approve`, real Kite reads, no orders. Check the daily reports and audit by hand.
3. **Go live, small:** `dry_run=false`, mode `approve`. The first week is capped at 2 buys a day by setting.
4. **Auto:** after 2 clean weeks with no unexplained audit rows.

**Acceptance criteria:**
- A buy never exceeds 25% of the fund or spendable cash.
- No more than 4 buys and 4 sells a day.
- NIFTYBEES and other holdings are never sold.
- Each fill gets its GTT within 10 minutes.
- The breaker pauses, and stays paused until resumed.
- `/stocks` has no Kite code paths left.
- Every action can be found in `mlive_audit_log`.

## 13. Open items
- [x] Exit parameters: backtest done, results in section 7.5
- [ ] Kite order-charges API availability on the Personal plan
- [ ] Kite redirect URL change to `/api/mlive/kite/callback` (Sanjay, in the developer console)
