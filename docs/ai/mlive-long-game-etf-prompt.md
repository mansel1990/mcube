You are working in `C:\Projects\mcube` on Mansel Live. Add a separate long-term research book and UI called **Long Game**. It is for irregular lump-sum investments held for years, not SIPs and not swing trades. Capital, holdings, limits and results must remain completely separate from the live ₹80,000 trading book.

The chosen risk profile is balanced:

- 60% Indian equity;
- 25% gold;
- 15% liquid/debt;
- deploy a new opportunity in three stages;
- Indian indexes, gold and liquid/debt only.

This task is research-only. Build and run only the frozen building-sample tests below. Do not inspect or run held-back dates, choose a winner automatically, create Kite orders, modify `strategies_enabled`, or emit live BUY/SELL alerts. The UI must clearly say `Research only · not activated` until a later held-back task explicitly activates one frozen candidate.

## 1. Keep it separate

- Add a dedicated route: `/live-trade-mansel/long-term`.
- Add a separate `Invest` group to the desktop navigation with `Long Game`, and add it to the mobile More menu.
- Do not put these assets in `mlive_positions`, the swing book, swing pacing, the circuit breaker, or the existing ETF exclusion logic. Existing rules that prevent the trading engine from touching ETFs remain unchanged.
- The first version is advisory and manual. It never places, modifies or cancels a Kite order. Do not add an engine cron that can trade.
- Reuse common display components where useful, but do not force long-term results through swing's trade-count, average-trade or profit-factor pass bar.

## 2. Data before strategy

The research needs continuous total-return series, not unadjusted ETF closes. Use:

- NIFTY 50 TRI;
- NIFTY NEXT 50 TRI;
- NIFTY MIDCAP 150 TRI;
- an INR gold total-return series or adjusted Gold ETF NAV including distributions and corporate actions;
- a liquid/debt total-return proxy suitable for parked capital.

Prefer official NSE Indices, AMFI, RBI, CCIL or fund-house data. Store each source URL/file identifier, retrieval timestamp, checksum, raw date range, adjustment method and missing sessions. Never silently substitute Yahoo data, a price index for a TRI, raw `GOLDBEES`/`LIQUIDBEES` closes, or a forward-filled value.

Add a versioned long-term data table or files under the existing market-data system without rewriting raw swing candles. Before running:

- align all series to the NIFTY session calendar;
- use only information published by that signal close;
- document holidays and each stale/missing observation;
- require the warm-up needed for 10-month averages and 12-month returns;
- fail if the exact common building window cannot be produced rather than shortening it silently.

For investable-return simulation, use either adjusted ETF NAV/close with distributions or TRI less an explicitly stored conservative annual tracking/expense drag. Explain the choice. Add doubled-drag and doubled-transaction-cost stresses. A backfilled index history is acceptable only when labelled as such; do not imply an ETF was tradeable before launch.

## 3. Frozen samples and capital

- Warm-up: load at least 12 complete months before the building window.
- Building sample: `2011-01-01` through `2023-12-31`. This start is frozen because the official NIFTY 1D Rate Index begins in January 2011; do not splice an older liquid-fund proxy into the primary test.
- Held-back sample: `2024-01-01` through the latest complete session. Do not query, calculate, display or inspect it in this task.
- Starting capital: ₹1,00,000, with no later contributions or withdrawals in the backtest.
- Fractional index units are allowed for the research calculation; also report a whole-unit ETF feasibility replay using representative current ETFs.
- Dividends/distributions are reinvested.
- Unallocated money earns the liquid/debt series return, not zero.
- Signals are calculated at a close and executed at the next available session. Never fill using the same close that created the signal.

## 4. Static balanced benchmarks

Run both predefined benchmarks. These are controls, not settings to optimise.

1. `STATIC-NEXT`
   - 40% NIFTY 50 TRI;
   - 20% NIFTY NEXT 50 TRI;
   - 25% gold;
   - 15% liquid/debt.
2. `STATIC-MID`
   - 40% NIFTY 50 TRI;
   - 20% NIFTY MIDCAP 150 TRI;
   - 25% gold;
   - 15% liquid/debt.

Invest at the first executable building-sample session. Review at each March month-end and execute the annual rebalance next session. Also rebalance next session when a sleeve is more than 5 percentage points from target at a month-end. Report how many drift and annual rebalances occur.

## 5. Frozen Long Game opportunity rules

Run `RADAR-NEXT` against `STATIC-NEXT` and `RADAR-MID` against `STATIC-MID`. Do not search a parameter grid.

Each risky sleeve has a fixed target: NIFTY 50 40%, the secondary equity index 20%, gold 25%. Liquid/debt has a 15% minimum and receives all undeployed or exited capital. A sleeve may never exceed its target by more than rounding.

All percentages below use the underlying total-return series.

### Trend and drawdown state

- Long-term trend is positive only when the latest completed month closes above its 10-month simple moving average and its 12-month return is positive.
- Drawdown is measured from the highest daily close in the previous 252 sessions.
- A normal correction is a drawdown of at least 8% but less than 20% while the long-term trend remains positive.
- A crisis correction is a drawdown of at least 20%. Never buy merely because that threshold was touched.
- Weekly signals use the last trading session of the week. Holiday-shortened weeks are valid.

### Normal-correction entry

After a normal correction, arm the sleeve. Deploy sequentially:

1. Stage 1: 30% of that sleeve's target after a weekly close exceeds the highest daily close recorded in the previous completed week.
2. Stage 2: another 30% after a later weekly close is above the 10-week EMA of weekly closes and above the Stage 1 signal close.
3. Stage 3: the remaining 40% after a later weekly close makes a new 13-week closing high.

Allow at most one stage per sleeve per week. If two conditions become true together, execute only the next pending stage. Cancel an unfilled stage if the exit regime below becomes true before execution.

### Crisis entry

After a 20% or larger drawdown:

1. Stage 1: 30% only after a weekly close exceeds the highest weekly close of the previous four completed weeks.
2. Stage 2: another 30% after a later completed month restores the positive long-term trend.
3. Stage 3: the remaining 40% after a later new 13-week closing high.

The same sequential and one-stage-per-week rules apply.

### Major-reversal exit

There is no profit target and no daily stop.

- A warning regime occurs when a completed month is both below its 10-month average and has a negative 12-month return.
- On the first warning month, sell 50% of that sleeve at the next session and move the proceeds to liquid/debt.
- If the next completed month is again a warning, sell the remainder at the next session.
- If the warning clears before the second month, retain the remainder; do not immediately restore what was sold. Re-entry requires a new staged opportunity.
- Reset a sleeve's entry stages after a full exit.

Use the rules literally. If any condition is ambiguous, stop and report it before running rather than choosing the most profitable interpretation.

## 6. Costs, tax and execution

- Apply actual delivery-side Zerodha charges on representative ETF quantities, including DP charges on sells, plus 0.05% adverse slippage on each tradeable side.
- If the primary TRI-minus-drag model has no units, apply an equivalent stored percentage-cost model and show the whole-unit ETF replay separately.
- Primary results are pre-tax because historical Indian tax regimes changed. Add a clearly labelled current-tax stress using sourced, configurable equity-oriented and non-equity ETF treatment with an as-of date; do not describe it as historically exact.
- Report turnover, number of allocation-changing events, average years held, tracking/expense drag, charges and tax-stress impact.

## 7. Frozen acceptance comparison

Do not declare a RADAR variant better merely because its CAGR is higher. Compare each RADAR only with its matching STATIC benchmark.

A RADAR candidate earns a later held-back test only if all are true on the building sample:

- maximum drawdown is at least 15% lower on a relative basis than its STATIC control;
- CAGR is no more than 2 percentage points below its STATIC control;
- at least 80% of rolling five-year windows have a positive return;
- recovery time from the worst drawdown is shorter than the STATIC control;
- average allocation-changing events are no more than six per calendar year;
- doubled-cost and doubled-drag stresses do not reverse the drawdown advantage;
- no result depends on one asset or one short period for most of its profit.

If neither RADAR candidate qualifies, retain the better-explained STATIC portfolio as the result. Do not tune thresholds, add assets or inspect held-back data.

## 8. Report

For all four rows report:

- ending value, CAGR, maximum drawdown, peak/trough/recovery dates and days underwater;
- calendar-year returns and rolling 1/3/5-year returns;
- volatility, downside deviation, Sharpe and Sortino with the stated risk-free assumption;
- allocation through time, average allocation per sleeve and time parked in liquid/debt;
- turnover, allocation events, holding duration, charges and tracking drag;
- worst year, worst rolling year and worst five sessions;
- contribution to return and drawdown by sleeve;
- doubled-cost, doubled-drag and current-tax stresses;
- whole-unit ETF feasibility differences;
- exact data provenance and every remaining limitation.

Show STATIC versus matching RADAR side by side. Store all effective rules, targets, data version, fingerprint, costs and sample dates in the run identity. Duplicate-run protection must include them.

## 9. Research storage and CLI

Prefer extending the existing research-run architecture with a separate `longterm` book and a migration that safely updates relevant constraints. Add declarative CLI support such as:

`npm run engine -- research --book longterm --sample building --variant STATIC-NEXT,STATIC-MID,RADAR-NEXT,RADAR-MID --no-grid --anytime`

Reject unknown variants. Assert and log the exact building window before loading asset values. The command must fail if it resolves to held-back dates. Keep old swing and intraday runs unchanged.

Store long-term-specific metrics in structured result data without pretending allocation events are stock trades. If shared result columns are unsuitable, add a versioned JSON metrics field rather than putting misleading zeroes into profit factor or trade-count fields.

## 10. Long Game UI

Build the route using existing Mansel Live tokens and responsive card styles.

### Header

- Title: `Long Game`
- Subtitle: `Long-term ETF and gold opportunities`
- Persistent pill: `Research only · not activated`
- Data freshness with the latest complete date and a visible stale/missing-data warning.

### “What should I do now?” card

Until a candidate later passes held-back, show:

`No live recommendation. Long Game is still being researched.`

Do not derive an actionable current signal from the building sample. Design the locked future state now so a later activation can show, per sleeve:

- `WAIT`, `STAGE 1`, `STAGE 2`, `STAGE 3`, `HOLD`, `REDUCE` or `EXIT`;
- the close date used, next action, objective reasons and invalidation;
- target allocation, manually recorded allocation and the rupee amount for the next stage;
- an input for `Available to invest` that performs client-side calculations only and does not place an order.

### Allocation and research

- Target card: 60% equity · 25% gold · 15% liquid/debt.
- Sleeve cards for NIFTY 50, the tested secondary equity index, gold and liquid/debt.
- Allocation history as a stacked chart, portfolio value against both STATIC controls, and drawdown.
- A STATIC-versus-RADAR comparison with every acceptance rule shown as pass/fail.
- Calendar and rolling-return views, stress results, event timeline and an `About the data` disclosure.
- Explain in plain language why money remained liquid, why each stage occurred, and why a reduction/exit occurred.
- Label annualized returns as backtest CAGR, never “yearly return”.

### Future manual ledger, disabled in this task

Plan a separate long-term transaction ledger for manually recording buys, sells, units, price and charges. Do not reuse swing positions and do not infer ownership from Kite. In this task, render the holdings section as disabled with `Available after a strategy passes held-back`.

On mobile, cards stack, charts remain readable, and the primary state/reason appears before metrics.

## 11. Tests and handoff

Add focused tests for:

- no look-ahead in month-end, weekly reversal and next-session execution;
- holiday-shortened weeks;
- exact staged sequencing and one stage per week;
- normal versus crisis arming;
- two-step major-reversal exit and cancelled second exit when the warning clears;
- sleeve caps and liquid/debt residual;
- annual/drift rebalancing;
- total-return/distribution handling and missing-data failure;
- deterministic run identity and held-back refusal;
- cost, drag and whole-unit assumptions;
- UI locked-state copy and no order-capable API call.

Run:

```text
npm run engine:test
npm run engine:build
npx eslint . --max-warnings 0
npm run build
```

Check the UI at 1440 px and 390 px. Finish by reporting the building-sample comparison, whether either RADAR candidate earned a held-back test, exact data sources, tests, migration and remaining limitations. Stop there. Do not run held-back, activate recommendations, create alerts or connect Long Game to Kite ordering.
