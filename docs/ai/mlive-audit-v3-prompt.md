You are working in `C:\Projects\mcube` on Mansel Live. Rebuild the Audit page to match the design canvas https://claude.ai/artifact/XZN7wDwKuKrX2VfqntUXuB, artboards `AuditDaily.dc.html` (landing), `AuditSystem.dc.html`, `AuditLog.dc.html`, and the "Against Nifty 50" card on `Reports.dc.html`. Where this prompt and an artboard disagree on looks, the artboard wins. Every number comes from the database; nothing from the artboards is hard-coded. Do not touch `engine/` trading jobs. Keep `npm run lint`, `npm run build`, `npm run engine:build` and `npm run engine:test` green.

The idea: Audit answers "did the system do the right thing, and why?" The answer comes first; the detail is one click away.

## 1. Shell (`components/mlive/audit-view.tsx`)
- Header like Reports and Charts: "Audit" on the left; the view switch **Daily report · Log · System** as a segmented control on the **right**. Daily report is the default (`/live-trade-mansel/audit` with no `view`).
- Daily report and Log have a day stepper next to the title (‹ Mon 16 Nov ›); next is disabled on today. The day lives in the URL (`?view=daily&day=2026-11-16`).
- Remove the book switch from Audit for now (only swing is live). Remove the always-visible right-hand "Today / Rules / System" column from the Log view.

## 2. Daily report (landing)
- **Recent days** first, right under the header: a row of cards for the last 7 market days (day, net % with a coloured pill, what happened, and Nifty 50's % that day); the selected day is highlighted and clicking a card changes the day. A CSV button at the end of the row (reuse the ledger CSV).
- **Verdict card** next: a status pill ("Day closed" after 19:50, "In progress" during the day, "Before the open" before 09:15), a second pill "All rules held" (green) or "n rules broken" (red); **one plain sentence** built from the day's facts (examples: "Bought HEROMOTOCO after a late login. Two ideas skipped, nothing sold. Stops raised on two holdings in the evening." / "Nothing to buy today; holdings unchanged." / "Waiting for Kite login; buys held."); a muted line with the report time and account value at the official close. On the right: Net today (₹ and % of the account at the previous close), Nifty 50 the same day, then Bought, Sold, Skipped. Put the sentence builder in a pure function in `lib/mlive/` with tests for: normal day, no-trade day, late login, waiting for login, a sell, a broken rule.
- **"What it decided, and why"**: one row per decision of that day, oldest first: time, stock, action pill (Bought n, Sold n, Skipped, Stop set, Stop raised, Safety sell), and the reason in plain words. Ideas skipped only because the stock is already held are left out, with a small note "n ideas already held are left out".
- **Rules check** collapsed by default: the header shows "5 of 5 held" (or the failures in red, and then it opens by itself). Items: Swing buys (n of max), Cash used today, Holdings with a stop, Breaker, Intraday ("Not live yet" until the intraday book trades; then loss limit and closed by the `intraday_exit_time` setting).
- **"How the day ran"** (right column): a short vertical timeline of that day's steps with a coloured dot (done green, late amber, failed red, still to come hollow): login reminder, waiting for login (only if it happened), you logged in, morning checks, sells, buys, market close, nightly scan, stop updates, daily report. One line each with the result ("1 bought, 2 skipped", "2 stops raised"). Link "System" to the System view.
- Before 09:15 on today, the page shows today's state ("Before the open: Kite connected 08:21, buys at 09:45"), not yesterday's. Yesterday is one click on ‹.

## 3. Benchmark: Nifty 50
The benchmark for the whole app is NIFTY 50. Build it once and use it on Audit, Reports and Charts.
- Data: NIFTY 50 daily closes from `candles_daily` in the market database (kept current by the nightly `market-daily` job). Read it on the website through `lib/mlive/market.ts`.
- `lib/mlive/benchmark.ts`, pure and tested: given our daily account values, our deposits and withdrawals, and Nifty closes, return for a period: our return, Nifty's return, the difference in percentage points, and the number of market days we beat Nifty.
  - Our return is time-weighted: each day's change is (value − previous value − that day's deposits + withdrawals) ÷ previous value, chained over the period, so adding capital is never counted as profit. It is measured on all capital put in, including cash not invested, and after charges.
  - Nifty's return is close to close over the same days. Note in the UI that this is the price index, without dividends.
  - Days with no Nifty close (holidays) are skipped for both.
- **Audit › Daily report:** Nifty 50 % for the selected day in the verdict card, and on each recent-day card.
- **Reports › P&L:** an "Against Nifty 50" card under the account strip, as on `Reports.dc.html`: periods Since start · This month · 3M · 1Y; four figures (Mansel Live %, Nifty 50 %, Difference in points, Days ahead "n of m"); one muted line explaining the method, plus "Too early to judge: compare after about 3 months" until 60 market days of history exist. Honours the book filter (All uses both books).
- **Charts:** add Nifty 50 as a second line on the account-value chart, rebased to our starting value on the first day of the range, with a legend; a toggle to hide it.
- Tests: deposits are not counted as returns; a holiday is skipped; days-ahead counting; rebasing.

## 4. System (today first)
- **Status banner** at the top that says where the day stands right now, in one line, coloured by state: "Ready for the open", "Waiting for Kite login (buys held)", "Market open: buys done, watching fills", "Market closed: evening jobs next", "Something failed: <job>" (red), "Market closed today (holiday/weekend)". Include the current time and the next step.
- **Today's timeline** grouped as **Before the open · Market hours · Evening**. Each step: planned time, name, one line of what it does or what it did, and a pill: Done, Next up (highlighted row), Planned, Ran late, Failed, Skipped. Build it from one schedule list in `lib/mlive/schedule.ts` (time, job kind, title, description, group) — the same list `engine/deploy.sh` installs, so add a test that every cron line has an entry — joined to today's `mlive_runs` and audit rows. Routine repeats (approvals every minute, sync every 5 minutes) show as one step ("Fills and stops, every minute 09:45–14:30") with a count of runs and errors, not one row per run. Clicking a step opens its last runs and their log tail.
- Right column: **Health** (Server online/stale from the heartbeat if present, Kite session valid until when, Price feed state, Candles up to which day, main and market database size), **Yesterday** (one sentence: "All jobs ran. Buys ran late at 10:00 because Kite was connected at 09:57." with a link to that day's report), **Last deploy** (commit and time; "Not reporting yet" if there is no deploy table).
- Remove the raw list of the last 12 runs and the "market database has no history tables" note (it is wrong now; read sizes live).

## 5. Log
- One filter row: type pills **Decisions** (default) · Orders · Stops · You · Alerts (with unread count) · Everything; on the right a search box and **More filters** (date range, who, book) in a popover. All filters in the URL.
- "Engine run", "run.*" and other routine rows are hidden unless Everything is chosen; say so in one muted line under the filters.
- Rows grouped by day: time, who, action pill, stock, detail. Pager at the bottom. Alerts keep Mark seen and Mark all as read.

## 6. Checks
- Loading, empty, Kite not logged in, holiday and weekend states for each view.
- Phone (390 px): the view switch sits under the title and scrolls sideways; the right column moves under the main column; the timeline stays readable.
- Compare each view with its artboard at 1440 and 390 px and list anything that still differs and why.
