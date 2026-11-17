You are working in `C:\Projects\mcube` on Mansel Live. The first swing backtest (research run 1, building sample 2019–2023) has results that need checking before we trust them. Investigate and fix only real bugs; do not tune strategies to look better. Keep `npm run engine:build` and `npm run engine:test` green. Report what you found for each point, with numbers.

Run 1 default-parameter results (portfolio of ₹80,000):

| Strategy | Trades | PF | Avg net | Win | Worst DD | Profitable half-years | CAGR | Exposure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rs | 251 | 1.88 | 2.81% | 37% | 25.0% | 60% | 15.9% | 75% |
| trend_breakout | 245 | 1.40 | 1.19% | 40% | 19.9% | 80% | 6.7% | 46% |
| momentum | 58 | 1.25 | 1.19% | 38% | 12.4% | 60% | 1.6% | 7.8% |
| ema_v2 | 695 | 1.16 | 0.56% | 26% | 37.4% | 60% | 10.5% | 102.8% |
| ema (live rules) | 421 | 0.74 | −0.57% | 24% | 83.1% | 30% | −17.7% | — |
| rsi2 | 772 | 0.74 | −0.44% | 50% | 87.2% | 40% | −26.3% | — |

1. **Momentum is almost never invested (exposure 7.8%, 58 trades in 5 years).** A weekly top-5–8 rotation with NIFTY 50 above its 200-day average should be invested most of 2019–2023 except around the 2020 crash. Check the index filter (NIFTY 50 rows present and aligned by date), the rank threshold (top N by rank, not a fixed percentile), the Friday rebalance on weeks where Friday is a holiday, and whether the portfolio rules (2 new buys a day, 2 per sector, 6 open, 25% per order, 1% risk with no natural stop) block entries. Show how often each gate blocked an entry.
2. **ema_v2 exposure is 102.8%.** Exposure above 100% means invested value exceeded capital, or exposure is measured against starting capital while equity grew. Define exposure as invested value ÷ current equity, averaged over days, and confirm cash never goes negative.
3. **The live EMA rules test at PF 0.74, but the Python scanner's history showed PF 1.69 over 89 trades.** EMA is the strategy trading real money today, so this gap matters. Compare the port with the live behaviour: entry price (next open vs the 09:45 limit), the EMA20 trend stop and its "only moves up" rule, the GTT backstop 3% under it, and the scanner's own filters. Take 10 trades from the Python history and the matching backtest trades and explain each difference. If the port is wrong, fix it and say how.
4. **Drawdowns of 83–87% for ema and rsi2.** With 1% risk per trade these need a very long losing run or losses far larger than the stop. Show the 10 largest losing trades for each with entry, stop, exit and exit reason, and confirm that losses beyond 1.5× the planned risk come only from gaps through the stop.
5. **Survivorship.** Add a count to the run note of how many trades were in symbols that joined the Nifty 500 after the trade date, if that can be told from the data we have; otherwise say it cannot.

Then re-run `npm run engine -- research --book swing --anytime` and give the new table.
