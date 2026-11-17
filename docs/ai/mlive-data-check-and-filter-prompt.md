You are working in `C:\Projects\mcube` on Mansel Live. Two things before the next swing backtest. Do not change live trading jobs. Keep `npm run engine:build` and `npm run engine:test` green, and report numbers for each point.

## 1. Data check (market database `candles_daily`)
- **Real session gaps.** `market-check` counts missing sessions from 2015 even for stocks listed later. Count them from each stock's own first candle instead, against the NIFTY 50 session calendar. List every stock with a gap after its first candle (we know TATASTEEL is missing 28 May 2026). For those, re-fetch the missing days from Kite with a new `market-backfill --refetch-gaps` option (evening only, same pacing), then re-check.
- **Adjustments.** TRENT differs from the scanner's history by a factor of 1.5 and COALINDIA by about 5% on the same day. Find out which source is adjusted for splits, bonuses and dividends (compare our candles with NSE bhavcopy closes in `stocks.daily_ohlcv` for 10 stocks with known corporate actions in 2019–2026). Backtests must use split- and bonus-adjusted prices. Say whether Kite's candles already are, and if not, adjust them.
- **Exposure.** RS and momentum both reported exactly 64.8% exposure in run 2. Confirm each is computed from its own book, or fix it.
- Make `market-check` report real gaps per stock after these changes.

## 2. Market filter test
Add one optional rule to RS, momentum and trend breakout: **no new buys while NIFTY 50 closes below its own N-day average** (open positions keep their exits). Test N in {100, 150, 200} plus "off", as part of the settings grid. Do not change anything else in the strategies.

Also add a **pair** result: run RS and momentum together in one ₹80,000 book (each strategy may use at most half of the open-position slots), and the same for trend breakout with momentum. Report the pair's profit factor, drawdown, profitable half-years and yearly return next to the single strategies.

Then run `npm run engine -- research --book swing --anytime` and give the table: each strategy with filter off and at each N, and the two pairs.

## 3. Fixed variants to test (decided in advance; do not search for the best combination)
Universe stays today's Nifty 500 (no historical index lists). Keep the survivorship note on every run.

- **Book size:** per-position cap 15% (₹12,000 on ₹80,000) as a new book setting, used for every variant below. Also report the current 25% for comparison.
- **Momentum**
  - (a) as now (no stop, weekly);
  - (b) 12% stop under the entry price, kept as a GTT-style stop (a low through it sells at the stop, or at the open on a gap), and a daily exit when the stock falls out of the top 25 by 90-session return (sell at the next open); entries stay weekly, top 8;
  - (c) (b) plus no new buys while NIFTY 50 closes below its 50-day average.
  - Size: the fixed per-position cap (no 1% risk sizing for momentum).
- **RS**
  - (a) as now;
  - (b) once the close is 10% above the entry, the trailing stop uses 1.5 × ATR instead of 2.5 (still only moves up);
  - (c) sell half the position at the next open once the close reaches 3R (R = entry minus the initial 2.5 × ATR stop); the rest keeps the normal trailing stop. Charges are taken on both sells.
- **Pair:** RS (best of a–c) with momentum (best of a–c) in one ₹80,000 book, 15% cap, at most 3 open positions each.

Report every variant on the same table. Do not touch the held-back years.

## 4. Two more simulation fixes (do these before running section 3)
- **RS must buy the way live buys.** Only `ema` sets `useLimit`; RS still enters at the next open. Live sends every swing buy as a limit at the signal close plus 0.5%, skipped when the next open is more than 3% above the signal close (`limit_offset`, `chase_pct` from `mlive_settings`). Set `useLimit: true` for RS (and for momentum and trend breakout, since they would be bought the same way live). Report how many RS signals are now not filled, and RS before and after.
- **Sector cap must have sectors.** `run.ts` reads sectors from `mlive.mlive_instruments`, which only knows symbols the live engine has traded; every other stock falls back to its own symbol, so "2 per sector" almost never binds. Load the industry for every Nifty 500 stock from NSE's `ind_nifty500list.csv` (the `Industry` column, already downloaded by the market job) into the market database `universe` table, and use it in the backtest. Report how often the sector cap blocks a buy before and after.
