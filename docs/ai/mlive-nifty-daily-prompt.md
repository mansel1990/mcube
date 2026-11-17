You are working in `C:\Projects\mcube` on Mansel Live. Three small changes. Keep `npm run lint`, `npm run build`, `npm run engine:build` and `npm run engine:test` green.

## 1. Keep candles (and NIFTY 50) current every evening
- `engine/deploy.sh`: add a cron line that runs `market-daily` at **20:05 IST, Monday–Friday** (after `eod-final` at 19:50, so it never waits on the trading lock), using the same `run_line` helper as the other jobs.
- `lib/mlive/schedule.ts`: add `{ kind: "market-daily", time: "20:05", title: "Save today's candles", description: "Stores today's daily and 5-minute candles, including NIFTY 50.", group: "evening" }`, and keep the test that every cron line has an entry passing.
- `market-daily` must also fill any missed days: if the last stored daily candle is older than the previous trading day, fetch from the day after it up to today (daily and 5-minute Neon series only; not the files).

## 2. Say why a Nifty number is missing
`lib/mlive/benchmark-load.ts`, `app/api/mlive/nifty/route.ts`, `lib/mlive/daily.ts` and `lib/mlive/system-status.ts` swallow market-database errors and return nothing, so the page shows "—" whether the database is unreachable or simply has no row yet. Return a reason with the data: `"no-url"` (MARKET_DATABASE_URL not set), `"unreachable"` (connection or login failed; log the error on the server), `"no-data"` (no NIFTY 50 close for that day yet, for example today before 20:05). The page shows a short muted note for each: "Nifty data not connected", "Nifty data unavailable right now", "Nifty close not saved yet". Never show a made-up number.

## 3. Let backtests run from my PC at any time
`researchWindowOpen` / `researchWindowEnded` exist to protect the 1 GB server during trading. They should only apply on the server. Add `--anytime` to the research CLI: it skips the window checks, and it is refused when the hostname is `mcube-server` ("Backtests on the server run only outside trading hours"). The research-queue job ignores `--anytime`. Add a test for both cases.
