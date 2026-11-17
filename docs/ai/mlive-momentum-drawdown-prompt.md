You are working in C:\Projects\mcube on Mansel Live. Both live swing strategies are disabled. Run 4 found Momentum (a) promising but not live-ready: PF 2.145, 247 completed trades, average net 3.47% and CAGR 33.1% passed, while worst drawdown 23.49% and profitable half-years 6/10 failed. The official building bar has five tests: PF ≥1.4, trades ≥150, average net ≥0.8%, profitable half-years ≥7/10 and drawdown ≤15%.

Test the predefined sizing and breadth variants below using only the 2019–2023 building sample. Do not run or inspect held-back years. Keep Momentum's weekly exit, Nifty 200-day gate, 90-session ranking, conservative fills, clean-data eligibility and no-price-stop rule unchanged except where a breadth variant explicitly changes topN.

Use ₹4,000 as the minimum order for every new variant and store it in result params. The existing ₹8,000 minimum makes 10% positions nearly impossible and 7.5% positions impossible. Include a 15% control under the same ₹4,000 minimum so this setting change is measurable.

## Frozen variants

Reference only:
- Run 4 M15-8: top 8, 15% cap, ₹8,000 minimum.

New control and variants:
1. M15-control: top 8, 15% cap, max 8 open, ₹4,000 minimum.
2. M10-6: top 8, 10% cap, max 6 open. This is the lower-exposure/cash control.
3. M10-8: top 8, 10% cap, max 8 open. This isolates position-size reduction.
4. M10-10: top 10, 10% cap, max 10 open. This is explicitly a breadth change.
5. M-vol8: top 8, max 8 open and 80% total gross exposure. At entry, shares = 0.5% of current equity ÷ ATR(20), capped at 15% of current equity. Call this ATR exposure sizing, not bounded risk; positions are not resized later.
6. TB+M10: trend breakout plus M10-10 in one chronological ₹80,000 portfolio with shared cash, 10% position cap, max 10 total and max 5 per strategy.

Remove M7-12 from this run. Test broader top 12 only later if top 10 provides evidence that breadth helps.

Sector cap remains two per industry and new-buy cap remains two per day. Report blocks caused by sector, daily pace, max-open, cash, minimum order, position cap and unavailable quantity.

## Report

For every row report:
- completed trades, closed PF, average net, CAGR;
- drawdown percentage, peak date, trough date and recovery date;
- profitable half-years out of 10;
- average and maximum gross exposure, average position count and cash;
- open-at-end positions and unrealised P&L;
- average order notional and charges as a percentage of gross profit;
- concentration stress after removing the largest 1/3/5 winners;
- doubled-execution-cost stress;
- each calendar year's PF and book return.

Show which variants pass all five official tests. A variant is not live-ready merely because it passes the building sample. After selecting and freezing at most one candidate, the next separate task is one held-back run.

Add declarative CLI support, reject unknown variant names, include variants in run identity, and store every effective setting in params.

Run:
npm run engine -- research --book swing --variant M15-control,M10-6,M10-8,M10-10,M-vol8,TB+M10 --no-grid --anytime --force
