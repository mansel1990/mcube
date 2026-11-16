You are working in `C:\Projects\mcube` on Mansel Live. Add a **System** page that shows everything running for Mansel Live (server jobs, the Python scanner, deploys and server health) from Neon, so nobody needs to open the DigitalOcean console to know what's happening.

Follow the current mlive design (full width, mlive.css tokens, light and dark). Keep `npm run engine:test`, `npm run lint` and `npm run build` green, and **make `npm run engine:build` pass**: browser-only code such as the CSV download in `components/mlive/pnl-ui.ts` must not be imported under `engine/` or `lib/`.

## 1. Job registry and runs (migration `007_system.sql`)
- **`mlive.mlive_jobs`**, the catalogue of everything scheduled:
    - columns: `name` (primary key), `kind` (`engine` | `python` | `service` | `deploy`), `schedule` (a cron string, IST), `description`, `expected_minutes`, `critical` (bool);
    - seeded with every line from `/etc/cron.d/mlive`, i.e. the engine jobs (import-ideas, eod-stops, remind, preflight, sells, refresh, buys, approvals, sync, cancel, eod and eod-final);
    - plus the root crontab: `scanner-evening` (`0 18 * * 1-5`, `/opt/mcube-scanner/swing-trade/scanner/run.sh`) and `bhav` (`30 19 * * 1-5`, `/opt/mcube-jobs/bhav.sh`);
    - plus the services `mcube-kite-relay` and `caddy`.
- **Reuse `mlive.mlive_runs`** for every run, so the Python jobs write there too:
    - `engine/run.ts` already does this for the engine.
    - Add `scripts/ops/run-logged.sh <job-name> -- <command…>`. It inserts a `running` row, runs the command, captures exit code, duration and the last 40 lines of output, and updates the row to `ok` or `error`. It uses `psql` with `DATABASE_URL` from `/etc/mcube/mlive.env`, or a tiny node script if `psql` isn't installed.
    - Change `engine/deploy.sh` so the scanner and bhav crontab lines go through `run-logged.sh`. `deploy.sh` becomes the single owner of **all** cron lines: move the root crontab entries into `/etc/cron.d/mlive` and remove them from the root crontab.
- **Missed runs:** a pure helper `lib/mlive/system.ts` → `jobHealth(job, runs, now, holidays)`. It returns `ok` | `late` | `missed` | `error` | `running` | `idle`, where `missed` means a scheduled time passed by more than `expected_minutes` + 5 with no run. Test it with fixtures, holidays and weekends included.

## 2. Server heartbeat
- **New engine job `heartbeat`**, every 5 minutes, all day, every day. It writes one row to **`mlive.mlive_heartbeats`** (`ts`, `host`, `uptime_s`, `load1`, `mem_used_mb`, `mem_total_mb`, `swap_used_mb`, `disk_used_pct`, `relay_ok` from `http://127.0.0.1:<relay port>/health`, `caddy_ok`, `engine_sha` from `git rev-parse --short HEAD` in `/opt/mcube-src/mcube`, `node_version`).
- Keep 14 days of heartbeats, and delete older rows in the same job.
- The heartbeat is "stale" when there's no row for 15 minutes; the page shows a red banner, and `eod-final` raises a `problem` alert if it was stale during market hours.

## 3. Deploys
- `engine/deploy.sh` inserts **`mlive.mlive_deploys`** rows (`ts`, `sha`, `subject`, `status`, `step_failed`, `duration_s`, `log_tail`).
- `deploy.sh` must never leave the server without its cron file. Write the new cron to a temporary file and move it into place only after the build passes. If any step fails, keep the old cron and record `status = 'failed'` with the step name.

## 4. API and page
- `GET /api/mlive/system` (single-user auth), returning:
    - the jobs with their latest run, `jobHealth`, the next scheduled time (IST) and the last 10 runs;
    - the latest heartbeat and a 24-hour series;
    - the last 20 deploys.
- **Page `/live-trade-mansel/system`.** Add it to the nav as the gear-adjacent item "System", or as a tab inside Settings, whichever fits the nav better.
- **Top strip:**
    - Server (up or stale, uptime);
    - Engine version (sha + commit subject, with deploy time);
    - Kite relay (ok or down);
    - Last scanner run;
    - Last price-file load;
    - Disk %, memory %, swap %.
- **Timeline for today:** a horizontal 08:00–20:00 strip with a dot for every scheduled run, coloured ok, error, missed or upcoming, and hover details. A weekend or holiday shows "Market closed".
- **Jobs table:** name, what it does (`description`), schedule in words ("Weekdays 18:00"), last run (time, duration, status chip), next run, and a health chip. A row expands to show the last 10 runs, and clicking a run shows its `log_tail` (monospace, scrollable).
- **Deploys:** a list with sha, subject, time, status and the failed step.
- **Health charts:** CPU load, memory and disk over 24 hours, as small recharts lines.

## 5. Tests
- `jobHealth` cases: ok, late, missed on a weekday, nothing expected on a weekend or holiday, error, and running too long.
- The cron line → "Weekdays 18:00" text helper.
- `deploy.sh`: `bash -n`, plus a dry mode (`--dry`) that prints the cron it would write without touching anything.

## Manual step (list it)
Run migration 007. I'll run `deploy.sh --install` on the server; it moves the scanner and bhav crontab lines into `/etc/cron.d/mlive`.

**Done means:** paste the test, lint, build and engine:build output and the diff. Attach a screenshot of the System page.
