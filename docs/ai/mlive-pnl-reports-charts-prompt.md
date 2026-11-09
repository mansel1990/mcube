You are working in `C:\Projects\mcube` on Mansel Live (`/live-trade-mansel`). Build a polished **Charts** page and a complete **Reports** page, both driven by one profit-and-loss model.

- Real money: the numbers must be exact and must agree everywhere.
- Write the tests first. Keep `npm run engine:test`, `npm run lint` and `npm run build` green.
- Don't run engine jobs locally (local and prod share one DB).
- Do this after the pending fix (charge ledger rows matched by the order's `placed_at`) is committed.

## 0. Look and feel
Follow the mockup's tokens, fonts and colours (`docs/plans/stocks/mockups/mlive-ui-mockup.html`), in dark and light. Use `recharts` (already installed). It should feel like a premium trading app:

- **Charts:**
    - Smooth area charts with a soft gradient fill under the line.
    - Thin gridlines. Rupee axes in Indian format (₹1.2L, ₹80,000).
    - A custom tooltip card: date, value, and the change from the previous point.
    - A short entry animation of about 400 ms, turned off when `prefers-reduced-motion` is set.
- **Stat cards:** a large number, a small label, a coloured change chip (▲/▼ with sign, never colour alone), and a 30-day sparkline where it makes sense.
- **Layout:**
    - A 12-column grid with 16 px gaps and rounded cards with a subtle border.
    - On mobile: one column, cards two per row, and tables that scroll sideways with a sticky first column.
- **Colours:**
    - RS and EMA each have one colour (`--rs`, `--ema`) everywhere.
    - Profit `--up`, loss `--down`.
    - Charges get one muted amber, used consistently.
- **Empty states:** every card says what it needs, e.g. "Shows after 5 closed trades. You have 1." It never shows a blank card.
- **Accessibility:**
    - Every chart has `role="img"`, an `aria-label` summary, and a "Table" toggle that shows the same numbers.
    - Charts are focusable, and ←/→ moves the tooltip between points.
- **Remove the "Down from peak" chart completely.** Drawdown appears only as a number on a stat card, with the breaker shown as text ("4.2% of 25% breaker").

## 1. Store the charges by type (DB and engine)
**Migration `006_charge_items.sql`:** a new table, `mlive.mlive_charge_items`, with these columns:
- `id` (bigint identity primary key), `position_id` (references `mlive_positions`), `order_id` (references `mlive_orders`, nullable);
- `side`, `intraday boolean`, `source` (`kite`, `formula` or `adjustment`);
- `brokerage`, `stt`, `exchange`, `sebi`, `stamp`, `gst` and `dp` (all `numeric(12,2)`), and `total`;
- `ts` (default `now()`) and `dry_run`.

Add an index on `position_id`. Rows are append-only; corrections are new `adjustment` rows, which may be negative.

**Engine:**
- `MliveKite.contractCharges` returns the breakdown from Kite's virtual contract note (`brokerage`, `transaction_tax`, `exchange_turnover_charge`, `sebi_turnover_charge`, `stamp_duty`, `gst.total`, `total`).
- `applyFill` writes one item row per fill with the same numbers it books to the ledger.
- The same-day (intraday) correction writes an `adjustment` row.

**Backfill in 006:**
- Write estimated items for every position that has none, from its fills and the `charges.ts` rates, including the MPHASIS adjustment.
- `RAISE EXCEPTION` if any position's items don't sum to its booked charges.

## 2. One P&L model: `lib/mlive/pnl.ts` (pure)
`buildPnl({ positions, fills, chargeItems, ledger, equity, marks, gtts, ohlcv, today, range, strategy })` returns:

- **`summary`:**
    - capital deposited, withdrawn and net;
    - gross realised, charges total, charges by type, net realised, unrealised (live mark, else cost), net total;
    - return % on net capital, turnover, charges as % of gross and of turnover;
    - current account value, peak, current drawdown % and max drawdown (₹ and %), and breaker %.
- **`stats`:**
    - trades, wins, losses, win rate;
    - avg win, avg loss, payoff ratio, profit factor, expectancy (₹ and R);
    - best and worst trade, longest win and loss streak;
    - avg and median days held;
    - average and max invested % of capital, and max open positions.
- **`trades[]`:**
    - id, symbol, strategy, status (open or closed);
    - entry date and average, exit date and average, qty, days held (trading days), intraday flag;
    - exit reason (`trend_stop` | `gtt_exit` | `gtt_fallback` | `manual` | `breaker`);
    - initial stop and current stop;
    - gross, the charges breakdown, net, net %;
    - R = net ÷ (qty × (entry − initial stop)). It's `null` when the entry was at or below the stop, and the flag `boughtBelowStop` is set;
    - MFE and MAE, the best and worst % from entry while held, from `stocks.daily_ohlcv`. A same-day trade uses that day's bar.
- **`byStrategy`:** `stats` plus net, gross and charges for `rs` and `ema`. Always return both strategies.
- **`byPeriod`:** daily, weekly (ISO, IST) and monthly rows (period, trades, wins, gross, charges, net, cumulative net), keyed by exit date.
- **`series`:**
    - daily account value (`mlive_equity_daily`, plus the first deposit as the start point, plus today's live point);
    - cumulative gross and net by exit date;
    - daily invested % and open-position count, from fills.

Rules:
- Deposits and withdrawals are never profit.
- An intraday adjustment lowers charges; it isn't profit.
- Dry-run rows are included only when `dry_run` is on.

**API:** `GET /api/mlive/pnl?range=1m|3m|all&strategy=all|rs|ema`, with the same single-user auth as the other mlive routes. Charts and Reports use only this, so they can't disagree.

## 3. Charts page (`/live-trade-mansel/charts`)
Top bar: a range switch (1M · 3M · All) and a strategy switch (All · RS · EMA), both segmented controls that apply to every card.

1. **Hero card:**
    - the account value in big type, with the net P&L (₹ and %) for the range as a chip;
    - a large gradient area chart of account value, with a dashed line at starting capital and a "Today (live)" dot;
    - a small row under it: Deposited · Net P&L · Charges paid · Open profit.
2. **Stat cards** (6 across on desktop, 2 on mobile):
    - Net P&L, Win rate (with wins/losses), Profit factor, Expectancy (₹ · R), Avg win / Avg loss;
    - Drawdown (current % of the breaker, and the max).
3. **Gross vs Net:** two cumulative lines, with the gap shaded amber and labelled "Charges".
4. **P&L by month:** rounded bars, green or red, showing net (weekly when there's under 2 months of data). The tooltip shows trades, gross, charges and net.
5. **Strategy face-off:** RS against EMA side by side. Each side shows net, trades, win rate, PF, expectancy and avg days held, plus a small cumulative-net sparkline, in that strategy's colour.
6. **Every trade:** one bar per trade in time order (net ₹, coloured by strategy), with a toggle for net % and R.
    - Tooltip: the symbol, the dates and the exit reason.
    - Clicking a bar opens the Trade panel (§5).
7. **R distribution:** a histogram (−2 to +5 R, bins of 0.5), with mean and median markers. Shows after 5 trades.
8. **Days held vs return:** a scatter, coloured by strategy and sized by position value.
9. **Why we sold:** a donut of exit reasons, with a legend table showing count and net P&L per reason.
10. **Best price vs final result:** a scatter of MFE % against net %, with a diagonal guide, to show the profit given back on exit. Shows after 5 trades.
11. **Money at work:** an area chart of invested % of capital, plus a step line for open positions, with reference lines at the max-positions setting and 100%.
12. **Charges breakdown:** a donut by type (brokerage, STT, exchange, SEBI, stamp, GST, DP), plus charges as % of turnover per month.
13. **Rolling form:** win rate and profit factor over the last 10 trades. Shows after 10 trades.

## 4. Reports page (`/live-trade-mansel/reports`)
Tabs: **P&L** (new, the default) · Trades · Ledger · Alerts · Audit. Keep the existing three tabs as they are.

**P&L tab:**
- **Summary strip:**
    - Net P&L, Gross P&L, Charges (₹ and % of gross), Open profit, Return %, Capital deposited.
    - Each item has an ⓘ tooltip with its formula, e.g. "Net = Gross − Charges".
- **"Where the money went":** a horizontal waterfall. It starts at Gross P&L, takes off each charge type in turn, ends at Net P&L, and shows the open profit separately.
    - Under it, a table: charge type, ₹, % of charges, % of turnover.
- **Period statement:**
    - A Day / Week / Month / All switch, and a table with period, trades, wins, gross, charges, net and cumulative net.
    - A totals row.
    - Rows expand to show that period's trades.
- **Capital statement:** starting capital, then deposits, withdrawals and net realised P&L, giving the current trading limit. Then open positions at cost and their open profit, giving the account value. Every line has a number, and it must add up exactly.
- **Strategy table:** RS and EMA rows with trades, win rate, gross, charges, net, PF, expectancy, avg R and avg days.

**Trades tab:**
- Columns: Stock, Strategy, Status, Entry (date · ₹), Exit (date · ₹), Qty, Days, Gross, Charges, Net, Net %, R, Exit reason.
- The table is sortable. Filter chips: Strategy, Won/Lost, Open/Closed, Exit reason.
- Open positions show unrealised P&L in italics and an "Open" chip.
- A row badge says "Bought below stop" when `boughtBelowStop` is set.
- Clicking a row opens the Trade panel.

**Export:** CSV buttons for the period statement and the trades table, as client-side downloads.

## 5. Trade panel (a side drawer, shared by Charts and Reports)
- **Header:** symbol, strategy chip, status, and net P&L in big type.
- **Price strip:** entry, initial stop, current or final stop, exit, MFE and MAE on one horizontal scale.
- **Sections:**
    - fills (time, side, qty, price);
    - charges by type, with any adjustment rows marked;
    - the stop history from `mlive_gtts.history`;
    - the decision sentence and sizing text;
    - links to its audit rows.
- **Closing:** Esc closes it. Focus is trapped inside while open and returns to the row on close.

## 6. Tests (`lib/mlive/pnl.test.ts` and component smoke tests)
**MPHASIS fixture** (buy 7 @ 2438.50, sell 7 @ 2444.80 on 2026-11-09, intraday, exit `gtt_fallback`, initial stop 2485.09):
- gross 44.10;
- charge items ≈ 18.1 after the adjustment, and the breakdown fields sum to the total;
- net = gross − charges, and equals that trade's fund-ledger rows within ₹0.01;
- days 0, `intraday` true;
- R `null` and `boughtBelowStop` true.

**Synthetic 6-trade set:** check exact win rate, PF, expectancy, payoff, streaks, the R histogram bins, and the monthly and ISO-week grouping in IST.

**Also test:**
- Deposits are never profit.
- The capital statement adds up exactly.
- An open position uses the live mark, or cost when there's no mark.
- Max drawdown includes the live point.
- `byStrategy` always returns both strategies.
- The range and strategy filters change every block consistently.

**Components:** each empty state renders with its "needs N trades" text. Charts mount without errors with 0, 1 and 12 trades. There is no "Down from peak" chart anywhere.

When done, paste the test, lint and build output and the diff. Add screenshots of Charts and Reports → P&L at 1440 px and 390 px wide, in dark and light, and list migration 006 as a manual step.
