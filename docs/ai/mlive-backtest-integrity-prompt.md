You are working in `C:\Projects\mcube` on Mansel Live. An outside review of runs 1–3 found problems that make the current results untrustworthy. Fix the simulator and data first, freeze the strategies, then re-run only the 2019–2023 building sample. Do not run or inspect the held-back years.

Do not change the entry or exit logic or tune a parameter in this task. The common data-quality, liquidity and history requirements below are frozen simulator eligibility rules and must apply equally to every swing strategy. Keep raw source candles unchanged; clean or exclude them in the research read layer and retain an audit trail. Keep `npm run engine:build` and `npm run engine:test` green and add a focused regression test for every fix.

## 1. Reproducibility and old runs
- Do not overwrite runs 1–3. Create a new run.
- Store the engine SHA, today's-universe snapshot, data-cleaning version and thresholds, excluded symbol/date ranges, and a deterministic candle-data fingerprint in the run metadata.
- Results with today's Nifty 500 still have residual survivorship bias. Say so explicitly; the eligibility rules below reduce it but do not remove it.

## 2. End-of-window positions
`engine/backtest/walk.ts` closes every open position on the final day and counts it as a normal trade. In run 3, four RS positions marked this way on 29 Dec 2023 contributed ₹54,679 of ₹87,054, and CUPID alone contributed ₹49,002.

- Preserve these as open lots in a separate `BookResult.openPositions`; do not insert them as completed `research_trades`.
- Closed-trade profit factor, win rate, average net, trade count and losing streaks exclude them.
- The equity curve, drawdown, period returns and CAGR still include their final close mark-to-market value.
- Report `Open at end: n positions, unrealised ₹x`, and state whether that unrealised figure includes estimated exit charges. Use the same convention in equity.
- A future held-back run must carry these lots forward rather than liquidating them and restarting flat, but do not run held-back in this task.

## 3. Causal price-data validation
Implement this in the research readers (`engine/backtest/data.ts`), without deleting or rewriting raw candles.

- Compare each stock with the NIFTY 50 session calendar. A gap of more than 20 NIFTY sessions starts a new history segment; it must not retroactively invalidate valid trades before the gap.
- A stock becomes eligible only after 250 clean sessions in its current segment. A later gap starts eligibility accumulation again.
- Detect any close-to-close or overnight open move over 40%. A matching move in the open is not by itself proof that the data is valid: listings, splits, bonuses and demergers commonly look that way.
- Validate each discontinuity against an official listing or corporate-action record when available. For a confirmed split/bonus/demerger, use a consistently adjusted OHLCV series (including inverse volume adjustment where applicable). Never mix pre-action and post-action price scales in returns, ATR, EMA or ranks.
- If a discontinuity cannot be validated, start a new clean segment at that date and require 250 subsequent clean sessions. Do not exclude sessions before the event because of information that was only visible later.
- This must remove placeholder/token-history contamination such as MEDANTA ₹60.20 → ₹415.30 and PRIVISCL ₹0.15 → ₹553.35. Investigate NMDC's 85.7% move rather than assuming that an opening gap explains it.
- Do not use an arbitrary minimum share-price filter; the traded-value rule below controls practical liquidity.
- Report symbols, bars and date ranges removed or adjusted, the reason for each, and which stored trades in runs 1–3 intersect the new exclusion mask. This is an impact audit, not a rewrite of those runs. Momentum traded PRIVISCL four times.

## 4. Frozen common eligibility rules
On each signal day, every swing strategy requires:

- at least 250 clean sessions in the current data segment; and
- 20-session average traded value (`close × volume`) of at least ₹10 crore, calculated only from information available through that signal close.

Report raw signal count, count removed by clean-history eligibility, count removed by traded value, and remaining signal count separately for RS, momentum and trend breakout. Do not describe this as eliminating today's-list survivorship bias.

## 5. 09:45 limit fills and intrabar ambiguity
Live buys go out from 09:45 through 14:30 as a limit at the signal close + 0.5%.

- Use 5-minute bars from 09:45–14:30 where those bars exist.
- If the next open is more than 3% above the signal close, the order is not sent.
- With intraday bars, fill at the limit or a better traded price after 09:45, never from a pre-09:45 price.
- Where only daily candles exist, label the fill as a daily-candle approximation. Fill at the limit price only when the daily range contains the limit; never award the open or daily low. Count and report all such approximated fills because the daily bar cannot prove when the crossing occurred.
- Apply the same execution model to RS, momentum and trend breakout.
- Rule exits stay at the next open with slippage. An intraday stop fills at the stop, or at the open when the market gaps below it.
- If an entry and its stop are both touched in one daily bar and their order cannot be known, use the adverse ordering in the primary result and report how many trades this affects.

## 6. Portfolio and metric fixes
- Compute pre-entry current equity as cash plus existing positions marked at that morning's open (fall back to the most recent close only when an open is unavailable).
- Position caps, the daily deployment cap and the 1% risk budget use that current equity, not the starting ₹80,000. Continue to keep ₹500 cash.
- RS sizes to the actual adverse exit assumption: `risk per share = entry − (trend stop × 0.97 × 0.99)`, representing the GTT 3% below the trend stop and a further 1% gap allowance.
- Calculate each month, half-year and calendar-year return directly from the daily equity endpoints. The first period starts at ₹80,000, all calendar periods in the test window are included, and a period is profitable only when its ending equity exceeds its starting equity. Do not add percentage returns.
- Count losing streaks among completed trades in exit-date order; break same-day ties by exit timestamp and then symbol. Exclude open-at-end lots.
- Show directional overlap both ways: `A's losing days also lost by B` and `B's losing days also lost by A`. State that only the combined-book result establishes whether the pair reduces drawdown.
- Use Zerodha charges on actual quantity. If a swing entry and exit occur on the same trading day, use the applicable intraday charge treatment rather than delivery DP charges.

## 7. Predefined stress tests
Report these next to every frozen result; do not search for a better parameter.

- Winner concentration: identify the baseline's largest 1, 3 and 5 completed winners by net rupee profit. Remove their positive P&L contribution while preserving their original holding period and without inserting replacement trades, then replay subsequent sizing from the reduced equity. Report stressed PF and CAGR. Label this a concentration stress, not a separate strategy.
- Execution: double adverse market/open slippage from 0.05% to 0.10% on each applicable side. A buy limit may not fill above its limit; a touched stop remains at the stop, while a gap exit receives the adverse open slippage. State these conventions.
- Calendar stability: for every year 2019–2023, report PF from completed trades exiting that year and the book return from that year's equity endpoints.
- Also report baseline trades, closed PF, CAGR, maximum drawdown, profitable half-years, exposure, open-at-end count and unrealised P&L.

## 8. Exact frozen re-run
Emit only these rows—no parameter grid, automatic best-of selection, tight-stop/partial-profit variants, or other strategies:

1. RS (a), 25% position cap.
2. RS (a), 15% position cap.
3. Momentum (a), 15% position cap.
4. Trend breakout with its optional index filter off, 25% position cap.
5. RS (a) + Momentum (a) in one ₹80,000 book, 15% position cap and at most three open positions per strategy.
6. Trend breakout + Momentum (a) under the same combined-book limits.

The pair rows must run one chronological portfolio with shared cash and constraints; do not combine two finished equity curves.

Run:

`npm run engine -- research --book swing --strategy rs,momentum,trend_breakout --no-grid --anytime --force`

Before execution, assert and log that the sample is `building` and its window is exactly 2019-01-01 through 2023-12-31. Fail rather than running if it resolves to held-back dates.

Give one comparison table containing all baseline and stress metrics, followed by the open-at-end positions, data adjustments/exclusions, per-strategy eligibility drop counts, approximated-fill count, same-bar ambiguity count, and the exact commands and test results. Explain any remaining limitation instead of silently choosing an assumption.
