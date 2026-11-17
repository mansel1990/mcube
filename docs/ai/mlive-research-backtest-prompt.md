You are working in `C:\Projects\mcube` on Mansel Live. Turn the research job into a proper, rerunnable backtester whose results show on the Research page. Follow Plan 2.0 ("Strategy research plan" and "How we test"). Keep `npm run lint`, `npm run build`, `npm run engine:build` and `npm run engine:test` green.

**Hard rule: a backtest never changes live trading.** It reads candles and writes only research tables. It never writes `mlive_settings`, never calls `swingSwitch`, never places orders, and never takes the engine's trading lock.

## 0. What is wrong today (fix all of it)
- `engine/research.ts` sets `swing_half_size` itself, and `engine/jobs/research.ts` calls `swingSwitch()`, which can change `strategies_enabled` and retire RS and EMA for new live buys. Remove both. `swing-switch` stays a separate job that is not in cron; promoting a strategy to live is a later, manual step.
- It loads every daily candle into memory at once and ranks every symbol against every other symbol per day. The server has 1 GB of RAM. Stream per symbol instead (section 3).
- Intraday strategies read `candles_1m`, which is empty. The history is in monthly gzip files (section 2).
- Charges are estimated on one share's price, so flat charges (DP on delivery sells, ₹20 brokerage caps) are badly wrong. Charges must use the simulated position's quantity and turnover.
- The momentum "index filter" only checks that the stock has 200 days of history. It must check NIFTY 50's close against its own 200-day average.
- It scores the held-back years on every run. The held-back sample may be run only on purpose (section 5).
- `runJob` skips weekends and holidays and holds the trading lock. Research must run on any day and must not block trading jobs.
- Bars before 3 Aug 2026 run to 15:25 but live trading in F&O stocks stops at 15:15 (closing auction since 3 Aug 2026). Apply one cutoff to all history (section 4).

## 1. Tables
Main database (small rows only), migration `scripts/sql/mlive/009_research.sql`:
- `mlive.mlive_research_runs`: `id`, `book` (`swing` | `intraday`), `sample` (`building` | `heldback`), `status` (`queued` | `running` | `ok` | `error`), `requested_by`, `requested_at`, `started_at`, `finished_at`, `params` jsonb (strategies, grid, date windows, costs, capital rules), `data` jsonb (symbols, first and last candle date per series), `engine_sha`, `error`, `note`.
- `mlive.mlive_research_results`: one row per run × strategy × parameter set: `run_id`, `strategy`, `params` jsonb, `is_default` bool, `trades`, `win_rate`, `profit_factor`, `avg_net_pct`, `worst_drawdown_pct`, `longest_losing_run`, `half_years_profitable_pct`, `cagr_pct`, `exposure_pct`, `monthly` jsonb (month → net %), `equity` jsonb (date → value, at most 400 points), `passed` bool, `fail_reasons` text[].
- `mlive.mlive_research_overlap`: `run_id`, `a`, `b`, `loss_day_overlap` (share of A's losing days that are also B's).
- Allow `research` as a kind in `mlive.mlive_requests` (drop and recreate the check constraint).
- Keep the old `mlive.mlive_research` table read-only; stop writing to it.

Market database (bulky), created by the job if missing:
- `research_trades`: `run_id`, `strategy`, `params_key`, `symbol`, `side`, `entry_ts`, `exit_ts`, `entry_px`, `exit_px`, `qty`, `gross`, `charges`, `net`, `net_pct`, `r`, `exit_reason`, `bars_held`. Index on (`run_id`, `strategy`, `params_key`).
- When a run is deleted, its trades go too. Keep at most the last 20 runs' trades.

## 2. Reading candles
Add `engine/backtest/data.ts`:
- `dailyBars(symbol)`: one symbol at a time from `candles_daily`, ordered by date.
- `intradayBars(symbol, kind: "5m" | "1m", from, to)`: read the monthly files at `${MARKET_FILES_DIR:-/var/lib/mcube/candles}/<5m|1m>/<SYMBOL>/<YYYY-MM>.csv.gz` (columns `ts_ist,open,high,low,close,volume`, times already IST). Yield one session at a time.
- `universe(series)`: symbols from `universe` + `instruments`, plus NIFTY 50 for the index filter.
- Results must record that the universe is today's Nifty lists (survivorship bias) as a note on every run.

## 3. Memory and speed
- Never hold more than one symbol's bars plus small per-day arrays.
- Cross-sectional inputs are a first pass: for each symbol compute a `Float64Array` of 90-day returns (or the strategy's ranking value) by trading day, store them in a day × symbol matrix (510 × ~3,000 numbers is fine), then compute each day's percentile ranks once by sorting that day's values. Strategies get the rank series for their symbol.
- Run with `node --max-old-space-size=600`. Log peak RSS at the end of a run.
- A swing run over 2019–2023 for Nifty 500 should finish in under 10 minutes; an intraday run over the 5-minute files in under 30.

## 4. Simulation rules (shared by backtest and, later, live)
One strategy file per strategy under `engine/strategies/`, each exporting:
`{ name, book, params: { key: { default, grid: number[] } }, signals(context) }`. Signals use only bars that closed before the entry bar (no look-ahead).

Swing (`engine/backtest/swing.ts`):
- Entry at the next session's open plus 0.05% slippage, rounded to the tick size from `instruments`. Exit on the strategy's rule at the next open minus 0.05%.
- Stop backstop like the live GTT: if a day's low touches the stop, exit at the stop, or at the open if it gapped below.
- **Portfolio simulation with the live swing rules**, read from `mlive_settings` at run start and stored in `params`: ₹80,000 trading limit, at most 25% per order, 1% risk per trade, at most 2 new buys a day, cash used in one day, open positions, per sector, cash kept back. Rank same-day candidates by the strategy's own score. Report results both per trade and for the ₹80,000 portfolio (drawdown and monthly returns come from the portfolio).
- Charges with `lib/mlive/charges.ts` on the real quantity and turnover, delivery rates, including DP on sells.
- Candidates: `trend_breakout`, `rsi2`, `momentum` (weekly, Fridays, top 5–8 by 90-day trend while NIFTY 50 closes above its 200-day average), `ema_v2`. Also run the current live `ema` and `rs` rules as baselines, ported from what the live engine and the Python scanner use today; if a rule cannot be ported exactly, say so in the run note.

Intraday (`engine/backtest/intraday.ts`):
- Use only bars from 09:15 to 15:15 IST on every day, before and after 3 Aug 2026, so old days do not trade time that no longer exists.
- No new entry after `intraday_entry_window.after` (default 14:30); everything closed at `intraday_exit_time` (now 15:00) at that bar's close minus 0.1%.
- Entries at the next bar's open plus 0.1% slippage. Stops checked bar by bar; if a bar touches both stop and target, assume the stop.
- Book rules from `mlive_settings`: ₹20,000 capital, 1× leverage (buying power = capital × leverage), 1% risk per trade, at most 4 trades a day, stop for the day at −2%, shorts allowed. MIS charges on the real quantity.
- `orb`: universe each day = top 10 of Nifty 200 by first-5-minute volume against that bar's 20-day average; range of the first 5 or 15 minutes (grid); trade in the direction of the first candle; stop a fraction of 14-day ATR (grid).
- `vwap`: the 30 most liquid Nifty 100 names by 20-day traded value; long above session VWAP, short below, flip on a cross, at most 3 flips a day.

## 5. Samples
- Swing: building 2019-01-01 to 2023-12-31; held-back 2024-01-01 to the last candle.
- Intraday: there are only two years of 5-minute files. Building 2024-11-18 to 2026-04-30; held-back 2026-05-01 to the last candle. Store the windows in `params` so they show on the page.
- Default runs are `building`. A `heldback` run needs `--heldback` on the command line (or the page's confirm dialog) and is refused for a strategy that already has a held-back result, unless `--force`. The page shows "Held-back used on <date>" for that strategy.
- Each parameter key is tested across its grid. The default parameters are the result; the grid is shown to judge robustness. Never pick the best grid point automatically.

## 6. Scoring and the pass bar
Put the bar in `lib/mlive/research-bar.ts`, used by the engine and the page:

| Test | Swing | Intraday |
| --- | --- | --- |
| Profit factor after costs, building | ≥ 1.4 | ≥ 1.3 |
| Profit factor, held-back | ≥ 1.2 | ≥ 1.2 |
| Trades | ≥ 150 | ≥ 300 |
| Profitable half-years | ≥ 70% | ≥ 70% |
| Worst drawdown | ≤ 15% | ≤ 10% |
| Average net per trade | ≥ 0.8% | ≥ 0.1% |

`passed` is true only when every test for that sample passes; `fail_reasons` lists the ones that failed in plain words ("Profit factor 1.21, needs 1.4"). Intraday half-years are counted by calendar quarter when the window is under two years, and the page says so.

## 7. Running it
- CLI: `npm run engine -- research --book swing|intraday [--strategy a,b] [--heldback] [--no-grid]`.
- The Research page "Run backtest" button inserts a `research` request (book, strategies, sample). A new cron line in `engine/deploy.sh` runs `research-queue` every 10 minutes on any day; it starts the oldest queued request only between 16:00 and 08:00 IST and not between 17:55 and 20:00 (evening trading jobs), then marks it done.
- Record the run in `mlive_research_runs` (not `mlive_runs`), log progress lines, and on error store the message and raise a `problem` alert.

## 8. Research page (`components/mlive/research-view.tsx`, API under `app/api/mlive/research/`)
Use the v2.1 tokens and card style.
- Header: Swing / Intraday switch, a run picker (latest first: date, sample, status), and "Run backtest" (strategy checkboxes, building or held-back with a confirm for held-back). Show queued and running state.
- Run note strip: sample window, universe and its survivorship note, costs and slippage, capital rules, data range, the 15:15 cutoff (intraday).
- Results table: first row is the pass bar; one row per strategy (default parameters) with status, profit factor, avg net per trade, trades, win rate, worst drawdown, profitable half-years, result. Values green if they pass, red if they fail; hover shows the fail reason.
- Click a strategy: equity curve of the ₹80,000 (or ₹20,000) portfolio, monthly returns bars, the parameter-grid table, the trades table (paged from `research_trades`, filters for symbol and won/lost, CSV), and exit reasons.
- Loss-day overlap matrix between strategies, with a note that two strategies that lose on the same days should not both be kept.
- Keep "Live against backtest" (progress to 10 live trades per strategy), comparing live average net per trade with the building result.
- Empty states: no runs yet ("Run the first backtest"), no candles for a series, run failed (with the error).

## 9. Tests (vitest)
- No look-ahead: changing bars after day N does not change any signal on or before day N, for every strategy.
- Charges: one delivery round trip and one MIS round trip on a known quantity match `lib/mlive/charges.ts`.
- Portfolio rules: never more than 2 new buys a day or 25% in one order; cash never negative.
- Intraday: no bar after 15:15 is used; positions close at the exit time; the day stops after −2%.
- Metrics: profit factor, drawdown and half-year counting on a fixed trade list.
- Held-back guard: a second held-back run without `--force` is refused.

Also add `--only SYMBOL,SYMBOL` to the research CLI for quick tests. When done, run `npm run engine -- research --book swing --strategy ema_v2 --no-grid --only INFY,TCS` locally if a market database is reachable, list every file you changed, and tell me the exact commands to run on the server.
