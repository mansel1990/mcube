You are working in `C:\Projects\mcube` on Mansel Live. Fix the history download (`engine/jobs/market.ts`) so one evening run collects everything the backtest needs. Touch only `engine/jobs/market.ts`, `engine/kite.ts` (the `historical` method), `engine/cli.ts`, and a new `engine/jobs/market-check.ts`. Keep `npm run engine:build` and `npm run engine:test` green, and add tests for the date and chunk helpers.

## Bugs to fix
1. **Daily dates are one day early.** `historical()` returns `date.toISOString()`; Kite's daily candle is midnight IST, which is 18:30 UTC the day before, so `candles_daily.ts` stores the previous date. For `day`, return the IST calendar date (`YYYY-MM-DD`). For intraday keep the exact instant. Test with `2026-11-16T00:00:00+05:30` → `2026-11-16`.
2. **The full history does not fit in Neon.** Two years of 5-minute for Nifty 200 is about 7.4 million rows and one year of 1-minute for Nifty 100 about 9.3 million; the 650 MB gate would stop the run part-way through the alphabet with no 1-minute data. Follow Plan 2.0:
   - Neon `candles_daily`: Nifty 500 + indices, 2015 → today.
   - Neon `candles_5m`: Nifty 200, last 90 days only.
   - Neon `candles_1m`: nothing in the backfill (the live service fills it later).
   - Files: 5-minute Nifty 200 for 2 years and 1-minute Nifty 100 for 1 year, one gzip CSV per stock per calendar month at `${MARKET_FILES_DIR:-/var/lib/mcube/candles}/<5m|1m>/<SYMBOL>/<YYYY-MM>.csv.gz`, columns `ts_ist,open,high,low,close,volume`. Write to a temp file and rename. One Kite request per stock per calendar month. The size gate applies to Neon writes only.
3. **Slow start.** `refreshInstruments` and `loadUniverse` insert one row per HTTP call (about 9,000 calls). Keep only NSE `EQ` rows that are in the universe plus the index rows, and insert in batches of 500.
4. **Pacing and retries.** Keep at least 350 ms between Kite requests (limit is 3 a second). On 429 or 5xx back off 2 s, 5 s, 15 s. On 403 stop with the "session expired" message. Insert candles in batches of 1,000.
5. **Progress.** `download_progress` gets a `store` column (`neon` | `file`) in its key, so the Neon and file series resume separately. A restart continues from the last finished chunk and never re-downloads a finished month file. Log one line per finished stock with a running count ("5m files 37 of 200").

## Options
- `engine/cli.ts market-backfill --only INFY,NIFTY 50` runs every series for just those symbols (smoke test).
- `--series daily|5m-neon|5m-files|1m-files` runs one series.

## New job `market-check`
Read-only. Prints and stores in the run detail:
- per series: stocks expected, stocks present, rows, first and last date;
- stocks with no data or a first date later than expected (listed);
- sessions missing against the NIFTY 50 daily calendar;
- intraday days whose bar count is not 75 (5-minute) or 375 (1-minute), as a count and the worst ten;
- for 20 random stock-days, the last 5-minute close against the daily close; flag gaps over 0.5%;
- Neon market database size and the files directory size.
Exit code 1 if any series has under 95% of its expected stocks.

## Readers
`engine/research.ts` and `engine/jobs/intraday.ts` read `ts::text` in UTC. Read intraday bars as `(ts AT TIME ZONE 'Asia/Kolkata')` so bar times and day grouping are IST. Do not change strategy logic in this task.
