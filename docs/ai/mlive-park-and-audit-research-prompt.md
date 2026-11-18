You are working in `C:\Projects\mcube` on Mansel Live.

## Goal

Do not take Momentum or intraday live. Preserve their backtest infrastructure and results, audit the weak M10-6 held-back result, and use the available intraday data honestly while attempting a resumable backfill. This is a research and safety task, not a strategy-optimisation task.

## Known facts

- The frozen swing candidate is Momentum XI — Anchor (`M10-6`).
- Its 2019–2023 building result was strong, but the January 2024–current held-back result was approximately PF 1.25, CAGR 4.5%, 11.1% drawdown and 140 completed trades.
- Removing its largest held-back winner reportedly reduces PF to 0.94.
- The held-back summary says “5 of 10 profitable half-years”, which cannot describe January 2024–November 2026. Verify and correct this reporting error.
- One-minute intraday candles currently cover all 100 intended stocks only from November 2025 onward.
- The frozen intraday building window is 18 November 2024 through 30 April 2026; May 2026 onward is held-back.

## Non-negotiable research rules

- Do not change, tune or search any M10-6, ORB or VWAP rule or threshold.
- Do not test another swing or intraday variant.
- Do not use the already-viewed swing held-back period to select new parameters.
- Do not inspect or run the intraday held-back period.
- Never relabel a shortened or incomplete intraday run as a building-sample pass.
- Keep all prior runs immutable. Corrections create a new run linked to the superseded run and explain why.
- Research commands must remain incapable of creating decisions, orders, GTTs, alerts that request a trade, or live positions.

## 1. Prevent a live start without damaging exit safety

Inspect the effective production setting before changing anything. If Momentum is enabled for new entries, remove only Momentum from `strategies_enabled` using the existing audited settings path. Preserve every unrelated enabled strategy and setting.

Do not cancel, sell or alter an existing holding. If a Momentum position already exists, keep its normal weekly exit management and sell-safety watcher active. Report the before/after setting, whether any Momentum positions exist, and the audit record. Do not make any other live-trading change.

Show Momentum on the Research page as `Parked · research only`, retaining its frozen parameters and historical runs. Do not describe M10-6 as passed, recommended or live-ready.

## 2. Audit the existing M10-6 held-back run

Use the exact stored run, params, engine SHA and candle fingerprint. First determine whether the held-back run:

- used exactly the frozen M10-6 rules and costs;
- started with the intended cash/open-lot state rather than accidentally liquidating building positions or mixing building metrics;
- used only data available at each signal;
- retained open-at-end lots outside closed-trade PF and trade count;
- used the correct date window and did not mix building rows into held-back metrics.

Fix metric or presentation code if necessary, add regression tests, then rerun only the exact frozen M10-6 held-back specification if a code/reporting correction requires it. A corrected rerun is not a new parameter trial.

Report complete half-years individually with start equity, end equity and return. Label the current incomplete half-year separately and exclude it from any “x of y complete half-years” ratio. Explain the source of the erroneous “5 of 10” figure.

Audit the largest held-back winner using raw evidence:

- symbol, signal date, entry/exit dates, quantity and every fill assumption;
- gross P&L, charges, net P&L and percentage of total held-back net profit;
- daily and available intraday candles around entry and exit;
- liquidity, gaps, corporate actions, symbol changes and data adjustments;
- ranking inputs and clean-history eligibility on the signal date.

Do not delete a valid momentum winner merely because it is large. If its data or execution is invalid, fix the causal data/execution defect, record the exclusion or adjustment, and rerun the unchanged candidate.

For the corrected held-back result report:

- completed trades, closed PF, average net, CAGR and maximum drawdown with dates;
- yearly and half-year book returns;
- average/max exposure, cash and position count;
- charges as a percentage of gross profit;
- open-at-end positions and unrealised P&L;
- largest 1/3/5 winners and their share of total net profit;
- the existing concentration stresses after removing the largest 1/3/5 winners without inserting replacement trades;
- doubled-execution-cost stress;
- an explicit conclusion of `parked`, regardless of whether the old PF ≥ 1.2 bar is narrowly met.

Do not call the concentration stress a strategy variant. State that positive-skew momentum is expected to need large winners, but this held-back sample does not establish that the observed concentration is repeatable.

## 3. Preserve and triage intraday research

Inspect the existing one-minute importer before writing another downloader. Attempt to backfill only the missing building interval, 18 November 2024 through the day before existing reliable coverage begins, from the existing authorised source.

The backfill must be resumable and rate-limited, retain raw candles unchanged, record source/provenance and checksums, and report coverage by symbol and session. Do not forward-fill, interpolate, manufacture one-minute bars from five-minute/daily data, or silently drop weak-coverage symbols.

If the full missing interval can be obtained, run the original frozen intraday building study once, with its existing warm-up, eligibility, execution costs and acceptance rules. Assert that the resolved sample ends on 30 April 2026 and fail if any May 2026-or-later candle enters the run.

If the source cannot supply the missing history, do not weaken the official window. Run at most one clearly labelled `diagnostic` study from the first date on which all required symbols have adequate coverage through 30 April 2026:

- store `sample = diagnostic`, never `building`;
- show the exact calendar span, sessions and market phases;
- do not calculate or display an official pass/fail verdict;
- do not apply the 70%-of-half-years gate;
- use it only to reject obvious cost, execution or drawdown failures;
- state that a good diagnostic result is not evidence for live trading.

Before either run, report whether the 100-stock universe is point-in-time or based on current constituents. If it is current-constituent history, label survivorship bias prominently; a result with that limitation cannot qualify for live trading.

## 4. Tests, delivery and final report

Add focused tests for:

- complete versus partial half-year accounting and sample labels;
- separation of building and held-back metrics;
- largest-winner audit/concentration calculations;
- research paths having no order-writing capability;
- intraday diagnostic runs being unable to pass;
- rejection of intraday held-back candles from the building/diagnostic run;
- resumable import coverage and missing-session reporting.

Keep these green:

```text
npm run engine:test
npm run engine:build
npx eslint . --max-warnings 0
npm run build
```

Commit and push only related files. Apply required migrations and deploy only after all checks pass. Verify the production Research page and effective production setting without placing an order. Do not modify or commit unrelated work, including `docs/ai/mlive-research-unblock-prompt.md`.

Finish with one concise report containing:

1. whether Momentum new entries are disabled and whether any existing position still needs exit management;
2. the corrected M10-6 held-back metrics and the cause of the half-year discrepancy;
3. the complete audit of the dominant winner;
4. intraday backfill coverage or the exact source limitation;
5. full-building results if complete data became available, otherwise diagnostic results with no verdict;
6. every remaining bias or limitation;
7. commands, tests, commit SHA and deployment verification.

## Server facts Cursor cannot see

- The M10-6 held-back result to audit is the latest swing `heldback` run with status `ok` (run 13 or later). Run 12 is an out-of-memory crash that was manually marked `error`; leave it as it is.
- Research on mcube-server is capped at a 600 MB heap by the respawn in engine/cli.ts, and the swing held-back run needs about 720 MB (it only finished with NODE_OPTIONS=--max-old-space-size=2200 MLIVE_RESEARCH_HEAP=1, using swap). Either make swing research stream symbols so it fits in 600 MB, or add an explicit, documented `--heap <MB>` override for manual CLI runs. Do not raise the queue/cron default.
- With Momentum removed from strategies_enabled, momentum-eod must create no ideas, BUY decisions or cohort-driven entries. It must still propose weekly exits and run momentum-sell-watch for any existing momentum holding. Add a test for this.
- The 1-minute backfill must respect the existing research window (16:00–16:55 and 20:00–07:00 server time; stop by 07:55). It must use the current day's Kite session, stay within Kite rate limits and the 600 MB heap, check free disk space before starting, and stop cleanly (resumable) when the session expires.
- Stop after: checks green, commit pushed, migrations applied, and the settings change verified. Do NOT run the backfill, reruns or diagnostic study yourself; write the exact server commands in the final report, and they will be run on the server in the night window.