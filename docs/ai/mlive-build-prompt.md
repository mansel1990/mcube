# Build prompt — Mansel Live (`mlive`)

Paste everything below the line into your AI coding assistant, opened in `C:\Projects\mcube`. **All the work happens in this repo.** The `C:\Projects\trading` (`swing-trade`) scanner is not changed; it's only read for context.

---

You are building **Mansel Live (`mlive`)**, a live, rule-based trading system on Zerodha Kite, for one user (Sanjay). Real money is involved, so correctness and safety come before speed.

## Read first (all of it, before writing code)
1. `mcube/docs/plans/stocks/mlive-prd.md`: **the spec. Follow it exactly.** If something in it is unclear or impossible, stop and ask. Don't guess.
2. `mcube/docs/plans/stocks/mockups/mlive-ui-mockup.html`: **the target UI.** Open it in a browser and match its layout, tokens, colours, typography and behaviour (Home, Charts, Reports, Settings; dark and light; mobile bottom nav).
3. `mcube/docs/ai/CONTEXT_FOR_AI.md`: repo conventions. `trading/docs/CONTEXT_FOR_AI.md` (read-only) explains what the scanner writes to `swing.rs_signals` and `swing.ema_signals`.
4. `mcube/docs/plans/stocks/server-setup-2026-11-05.txt`: the server, static IP, cron jobs and paths.

## Hard constraints
- **New tables only:** everything lives in a new Postgres schema `mlive`, and every table is named `mlive_*` (PRD section 6).
    - Don't write to or alter `swing.*`, `sim.*`, `daily_suggestor.*` or `public.kite_sessions`.
    - The only shared tables you may **read** are `stocks.daily_ohlcv`, `swing.rs_signals` and `swing.ema_signals`. Never write to them.
    - Migrations go in `mcube/scripts/sql/mlive/NNN_*.sql`.
- **The web app never places orders.** It writes intents (approvals, settings, fund entries, pause and resume) to `mlive_*`. Only the TypeScript engine in `mcube/engine/`, running on the server (static IP 139.59.51.34), calls Kite to place, modify or cancel orders and GTTs.
- **Rules live in code:** sizing, cash check, 4 buys and 4 sells a day, 25% order cap, 1% risk, ₹8,000 minimum, max 6 positions, max 2 per sector, exclude list (NIFTYBEES and all ETFs), own-positions-only, circuit breaker, do-nothing cases (PRD section 5).
    - Put them in pure functions (`lib/mlive/rules.ts`, shared by the engine and the web), plus a single order guard (`engine/guard.ts`) every order goes through.
    - Write unit tests for every rule and every worked example in the PRD **before** the jobs that use them.
- **Ownership:** the system only manages positions recorded in `mlive_positions` from its own tagged orders.
    - Kite `tag` = `mlive` + side + short id, alphanumeric, ≤ 20 characters.
    - GTTs are tracked by `trigger_id`.
    - Never sell or GTT more than the system quantity. Never touch NIFTYBEES or any holding outside the system.
- **Exits:** no fixed profit target and no time-out. Trend-stop exit, tightened after a new 52-week high, plus a single-leg GTT hard stop. Read the parameters from `mlive_settings.exit.rs` / `exit.ema` (PRD section 7.5, already decided by backtest). RS: chandelier, highest close − 2.5×ATR(14). EMA: close below the 20-day EMA. Both: GTT 3% below the stop, no 52-week tightening.
- **Audit everything:** every job run, check, decision (with reason and sizing sum), order, fill, GTT change, setting change, approval, pause, resume and fund entry → `mlive_audit_log` (append-only).
    - Alerts → `mlive_alerts` plus web push, at levels `needs_you`, `problem` and `done` (PRD section 11).
- **Safety defaults:** ship with `dry_run=true` and `mode=approve`. Never automate the Kite login.
    - Never commit secrets. New env vars: `MLIVE_TOKEN_KEY` on Vercel and in `/etc/mcube/mlive.env` on the server.
    - Encrypt the Kite access token at rest.
- **Single user:** `/live-trade-mansel` and `/api/mlive/*` are only for Sanjay's user id.

## Work in these phases. Stop after each one, show me a summary and the diff, and wait for "go".

**Phase 1: Remove Kite from `/stocks`** (PRD section 9)
- Delete or strip the listed Kite components, API routes, `lib/kite/*`, the `kite-remind` cron and its `vercel.json` entry.
- `/stocks` (the paper demo) must build, lint and work exactly as before, minus Kite.
- Don't drop any database tables.
- Mark the old Kite PRDs as superseded.

**Phase 2: Database**
- The `mlive` schema with all tables, indexes, the append-only audit (revoke UPDATE/DELETE), seeded `mlive_settings` defaults, and an ₹80,000 deposit in `mlive_fund_ledger`.
- Seed `mlive_holidays` for 2026–2027, and `mlive_instruments` (sector from the NSE index constituent CSVs, ETFs flagged and excluded).

**Phase 3: Engine core** (`mcube/engine/` + `mcube/lib/mlive/`, TypeScript, Node 20)
- `rules.ts`, `guard.ts`, `audit.ts`, `alerts.ts`, `kite.ts` (the `kiteconnect` Node client, reading the encrypted token from `mlive_kite_sessions`), and the charges module.
- npm scripts `engine`, `engine:build`, `engine:test`.
- Full unit tests (vitest), including the PRD sizing table, the daily limits, exclusion, ownership, a breaker with a deposit, chasing, and each do-nothing case.

**Phase 4: Import ideas.** An `import-ideas` engine job (18:20 IST) copies the day's rows from `swing.rs_signals` and `swing.ema_signals` (read-only) into `mlive.mlive_ideas` (PRD section 10). Don't change the `swing-trade` repo.

**Phase 5: Engine jobs and schedule.** Build `preflight`, `sells`, `refresh`, `buys`, `approvals`, `sync`, `cancel`, `eod` and `eod-stops`, following the PRD section 7.2 timetable.
- Use a file lock and one `mlive_runs` row per run.
- Add `engine/deploy.sh`. It pulls mcube into `/opt/mcube-src/mcube`, builds the engine, and installs the cron lines (Asia/Kolkata timezone) on the server.
- Everything works in `dry_run` with real Kite reads.

**Phase 6: Web app.** `app/(mlive)/live-trade-mansel/` with Home, Charts, Reports and Settings, matching the mockup.
- `app/api/mlive/*` endpoints from PRD section 8.2, including the Kite login and callback at `/api/mlive/kite/callback`, which saves to `mlive_kite_sessions`.
- Push notifications reuse the existing VAPID setup.
- Its own layout; no DOTA shell.
- Responsive, accessible (real buttons and labels, keyboard focus), and dark and light themes.

**Phase 7: Docs.** Update `docs/ai/CONTEXT_FOR_AI.md`, `docs/reference/*` and the server notes with the new schema, jobs, routes, env vars and run commands.

## When you're done with each phase
- Run the build, lint and tests, and paste the results.
- List anything in the PRD you couldn't do or had to change, and why.
- List the manual steps I have to do, for example:
    - set `MLIVE_TOKEN_KEY` on Vercel and the server;
    - change the Kite redirect URL to `https://mcubetechstudio.com/api/mlive/kite/callback`;
    - run the migration.
