You are working in `C:\Projects\mcube` on Mansel Live. Redesign the Research page (`components/mlive/research-view.tsx` and `app/api/mlive/research/`) so it answers one question first: **which strategies have earned a place, and how close are the others?** Use the v2.1 tokens and card style. Do not change the backtest engine except where section 4 says so. Keep `npm run lint`, `npm run build`, `npm run engine:build` and `npm run engine:test` green.

## 1. Header
- Left: "Research". Right: the Swing / Intraday switch (in the URL).
- Under the title, one muted line for the selected run: "Run 1 · 17 Nov 12:11 · 2019–2023 building sample · 495 stocks". The run picker becomes a small "Earlier runs" dropdown at the end of that line.
- Remove the two long paragraphs of run notes from the page. Put them in an "About this run" disclosure at the bottom (section 5), written as a short list, not prose.

## 2. Verdict strip
One card under the header, coloured by state:
- "No strategy has passed yet. Closest: RS Resilience (fails 2 of 6 tests) and Trend breakout (fails 1 of 6)." — or "2 strategies passed: … Next step: held-back test." — or "Building sample not run yet."
- Small counters on the right: Passed n · Close (fails 1–2 tests) n · Failed n.

## 3. Strategy cards instead of the table
One card per strategy in a responsive grid, sorted: passed, then close, then failed (by profit factor inside each group). Each card:
- Name, a one-line plain description of the idea ("Buys stocks holding up better than Nifty", "Buys a breakout to a new high on high volume"…), and a status pill: Passed (green), Close (amber), Failed (red), Live now (indigo outline, for strategies currently trading: RS and EMA).
- **Six pass-bar tests as small rows with a tick or cross**, value against the bar, e.g. "Profit factor 1.88 ✓ needs 1.4", "Worst drawdown 25.0% ✗ needs ≤ 15%". The failing rows sit first.
- One big figure: yearly return on ₹80,000 (CAGR), with avg net per trade and trades under it.
- A small equity sparkline of the ₹80,000 portfolio.
- "Robust across settings" or "Depends on one setting": compare the default with the grid (for example, if every grid point's profit factor is within ±0.25 of the default and on the same side of the bar).
- Card click opens the detail panel (section 6).

## 4. Running backtests: no pointless repeats
- Replace the big "Run backtest" button with a quiet "New run" button in the header.
- It opens a small panel with: sample (Building · Held-back), strategy checkboxes, settings range on/off. It shows what will happen: "Runs tonight after 20:00 on the server" (or "Starts at 16:00" during the day), and "About 10 minutes".
- **No duplicate runs.** A run is identified by book, sample, strategy set, settings range, the engine's code version (`engine_sha`) and the last candle date. If an ok run with the same identity exists, the button for that combination is disabled with the reason: "Already run on 17 Nov with this code and data. Results won't change." A run is allowed again only when the code or the data changed, and the panel says which changed. Enforce the same rule in the API and in `research-queue`, not only in the UI.
- Held-back stays once per strategy: the checkbox for a strategy that already has a held-back result is disabled with "Held-back used on <date>".
- A queued or running run shows as a progress row under the verdict ("Queued for 20:00", "Running: 230 of 501 stocks"), and the button is disabled while it runs.
- Engine: `runResearch` and the request path compute and store the identity in `mlive_research_runs.params.identity`; refuse a duplicate with that message unless `--force`.

## 5. About this run (collapsed at the bottom)
A short list: sample window · universe and survivorship note · costs (delivery charges on real quantity, DP on sells, 0.05% slippage) · capital rules (₹80,000, 1% risk, 25% per order, 2 buys a day, 6 open, 2 per sector) · how stops work in the test · port notes for RS and EMA. Each one line.

## 6. Strategy detail (side panel)
Equity curve against NIFTY 50 rebased to ₹80,000 over the same dates; monthly returns as bars; the settings grid as a small table with the default highlighted; trades table (paged, won/lost filter, CSV); exit reasons. A note at the top if the strategy is live now: "Trading live since 6 Nov: n trades, avg net x% vs backtest y%".

## 7. Loss-day overlap
Move it under the cards as "Do they lose on the same days?": only pairs among passed and close strategies, as plain sentences ("RS and Trend breakout lose on the same day 55–58% of the time. Under 50% is better for a pair.").

## 8. Intraday tab
Same layout. When no intraday run exists: "Intraday has not been tested yet. Data: 5-minute bars from Nov 2024 (building Nov 2024–Apr 2026). Runs on the server after 16:00." with the New run button.

Check at 1440 px and 390 px. On a phone the cards stack and the detail opens full screen.
