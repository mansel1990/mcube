# Mansel Live: Intraday Retirement, Book Colours, and Long Game v3

**Owner decision date:** 2026-11-18  
**Rules version:** `longgame-frozen-v3`  
**Scope:** Mansel Live (`.mlive`) only

## Goal

Implement these related changes in order:

1. Record the owner's frozen Long Game decisions.
2. Retire Intraday without deleting its code, data, or research history.
3. Apply one identifying colour per book across Mansel Live.
4. Build Long Game as an isolated, ledger-backed book with Core and Radar pockets.

Momentum and Swing rules, settings, and live behaviour must remain unchanged except for the isolation fixes required to keep Long Game money and holdings out of Swing.

## Delivery phases and release strategy

Build the work as four reviewable commits. All required tests and verification commands must pass at the end of each phase before starting the next one.

### Phase A: rules, retirement, and visual foundation

- section 0 owner decisions and `longgame-frozen-v3`;
- held-back override and one-use guard;
- Intraday retirement;
- Mansel Live colour tokens and replacement;
- `/about/rules`.

This phase contains everything needed to authorize the held-back inspection, but implementation and deployment must not run that research automatically.

### Phase B: isolation and accounting foundation

- minimal Swing book-isolation changes;
- Long Game additive migrations and pocket data model;
- existing-holding registration;
- broker reconciliation, external exits, and Liquid ETF income.

Avoid broad Swing refactors. Prefer explicit `book = 'swing'` scoping and small book-specific data-access functions so existing Swing calculations remain equivalent while Long Game is empty and disabled.

### Phase C1: suggestions and execution

- Core and Radar suggestion calculations;
- FIFO charges and tax estimates;
- transactional approval and rejection;
- decision creation;
- guarded Long Game order placement;
- repricing, partial-fill, cancellation, and retry lifecycle.

Complete and test the engine work before beginning the UI phase.

### Phase C2: Long Game experience

- Long Game book and suggestion pages;
- Today integration;
- Reports, history, Audit, and Research integration;
- activation and disabled-state presentation.

### Dark deployment

The four phases are development and commit boundaries, not mandatory deployment boundaries. After every phase passes its gate, all commits may be pushed and deployed together while Long Game remains dark:

- `longterm` stays absent from `strategies_enabled`;
- `longterm_core_enabled` stays false;
- `longterm_radar_enabled` stays false;
- no research is run as part of deployment.

Deploying the completed dark code before Momentum's first live orders provides Thursday and Friday to verify unchanged Swing behaviour before Monday. Phase B may be deployed in that release only if the pre/post-deployment Swing equivalence checks in section 5 pass.

## Fixed design decisions

### Long Game pockets

- Core uses the frozen `STATIC` allocation.
- Radar uses the frozen `RADAR` signal.
- `longterm_secondary` defaults to `"mid"` and also permits `"next"`.
- Core may use either Midcap 150 or Next 50.
- Radar may activate only when `longterm_secondary = "mid"`.
- Selecting `"next"` blocks Radar in both the UI and engine. A RADAR-MID held-back result must never authorize RADAR-NEXT.
- The secondary setting cannot change while there are Long Game holdings, pending suggestions, or open Long Game orders without a separate transition plan.

### Existing Nifty 50 holding

The owner's existing Nifty 50 ETF holding was bought for this Long Game plan and will be registered as a Core opening contribution:

- ledger kind: `opening_holding`;
- money added: original units multiplied by original average purchase price;
- acquisition date and cost become the first FIFO lot;
- gain: current value minus original cost;
- no cash deposit is created;
- pocket cash remains ₹0.

### External Kite exits

There is no withdrawal button in Mansel Live. The owner sells or withdraws through Kite, and Mansel Live reconciles the result.

- Detect an unexplained reduction in Kite ETF units automatically.
- Use the actual Kite sell fill price when available; otherwise use that trading day's official close.
- If only one pocket owns the ETF, preselect that pocket.
- If both pockets own the same ETF, show one `needs_you` card requiring the owner to allocate the missing units between Core and Radar.
- Confirmation closes FIFO lots, records realised gain, updates attributed units, and records the withdrawal.
- Choosing “No” makes no accounting change and flags the discrepancy for investigation.

Kite aggregates identical ETF units across pockets. For example, if Core owns 100 NIFTYBEES and Radar owns 40, a Kite reduction from 140 to 120 proves that 20 units exited but does not identify which pocket supplied them. Mansel Live must not guess when that attribution affects pocket performance or tax lots.

### Liquid ETF income

Liquid ETF daily-dividend unit increases are recorded as explicit `income_units` ledger events. They are never deposits or withdrawals.

If both pockets hold the Liquid ETF, allocate new units proportionally to their pre-event units, use deterministic whole-unit rounding, assign any remainder deterministically, and audit the calculation.

### UI scope

All visual changes in this plan apply only to Mansel Live under `.mlive`. Do not modify Studio, Stocks, Loans, Admin, global design tokens, or unrelated application sections.

## 0. Record the owner decisions

### Frozen choice

Record `longgame-frozen-v3` as an additive rules version. Preserve v2 constants and historical run interpretation for reproducibility.

- Core: `STATIC-MID` by default.
- Radar: `RADAR-MID`.
- Core needs no held-back test because it is a fixed mix with no signals.
- Run 15 remains a failed building gate; the override does not convert any failed check to a pass.
- Record that run 15 showed:
  - STATIC-MID after-tax CAGR: 11.28%;
  - RADAR-MID after-tax CAGR: 10.33%;
  - RADAR-MID concentration: 43.9%;
  - STATIC-MID building drawdown: 23.6%;
  - RADAR-MID building drawdown: 12.4%.

Record the owner's reason verbatim:

> Our philosophy caps a fall at about 15%, set before these results; STATIC's building drawdown was 23.6% and RADAR-MID's 12.4%.

### Held-back override

Permit one inspection with:

```bash
research --book longterm --heldback --confirm-heldback --owner-override longgame-frozen-v3 --no-grid --variant STATIC-MID,RADAR-MID
```

The command must require all of the following:

- book is `longterm`;
- sample is held-back;
- `--confirm-heldback` is present;
- `--owner-override` is exactly `longgame-frozen-v3`;
- grid is disabled;
- variants are exactly `STATIC-MID,RADAR-MID`;
- the one authorized override has not already been consumed by a completed successful run, unless an independently authorized force policy exists.

Without the exact override, the existing building gate continues to block held-back access.

The override is consumed only after the run has status `ok` and both STATIC-MID and RADAR-MID result rows have been committed successfully. Queued, running, crashed, failed, cancelled, timed-out, or out-of-memory runs do not consume it. A running lease may temporarily block a concurrent attempt, but it is not consumption. Commit successful results and override consumption atomically where possible.

Persist in the research run:

- rules version;
- override value;
- requested variants;
- owner authorization reason;
- whether the override was consumed;
- the fact that it was inspection-only;
- the original failed building checks.

Research must remain incapable of creating decisions or orders.

### Radar qualification

Radar may activate only when the latest valid held-back run contains STATIC-MID and RADAR-MID in the same run and:

- RADAR-MID maximum drawdown is at most 15%; and
- RADAR-MID maximum drawdown is lower than STATIC-MID over the same held-back window.

Do not use the old generic `qualifies for live design` conclusion as the v3 activation rule.

### Rules page

Show the frozen choice, run-15 evidence, verbatim owner reason, inspection-only override, failed-check status, Core exemption, and Radar activation condition on `/about/rules`.

## 1. Retire Intraday

### Setting and central capability

Add:

```text
intraday_retired = true
```

Create one shared capability function and use it consistently in server routes, page models, navigation, APIs, settings, reports, charts, audit, Today, schedules, and engine jobs.

When true:

- hide the Intraday page and direct navigation;
- hide sidebar and phone-nav entries;
- hide Intraday cards on Today;
- hide Intraday filters, chips, columns, and empty sections in Reports, Charts, and Audit;
- hide Intraday settings;
- prevent the Intraday engine job from reaching Kite, market data, or order logic;
- preserve all code, tables, stored candles, files, and research runs.

When false, restore the existing UI and behaviour.

### Phone navigation

Use:

```text
Today · Swing · Long Game · Reports · More
```

### Research

Show a collapsed Retired section:

> Intraday (ORB, VWAP), retired 18 Nov 2026. Failed the full building test: ORB PF 0.71 over 710 trades, VWAP PF 0.34 over 1,342 trades (run N).

Read the actual stored run ID and verify the stored metrics before presenting this sentence. Do not assume the run ID from prose or create a new research run.

### Market-data and cron behaviour

The current `market-daily` job downloads daily and 5-minute Neon candles. It does not currently run a daily 1-minute file download.

While retired:

- keep the `market-daily` cron because daily candles are still required;
- make its active plans include daily candles only;
- exclude the 5-minute Intraday plan;
- ensure the 1-minute plan cannot run as part of the daily job;
- retain manual historical research/backfill support and existing files.

There is currently no Intraday engine cron entry to remove. Keep deploy output free of Intraday-only entries and test that condition. Setting the flag to false restores the 5-minute daily plan.

### Intraday tests

Test:

- retired and unretired navigation;
- direct route behaviour;
- Today cards;
- Reports, Charts, Audit, and Settings controls;
- Research retired copy and actual run ID;
- engine no-op before Kite access;
- daily market-data plans in both states;
- deploy cron output;
- absence of empty sections and zero-value Intraday rows.

## 2. Mansel Live colour system

### Shared tokens

Define the palette once as CSS variables under `.mlive` and once as a TypeScript map.

#### Neutral UI

- Ink: `#14161C`
- Raised ink: `#2A2D36`
- Page: `#F6F4EF`
- Card: `#FFFFFF`
- Border: `#E4DFD3`
- Text: `#14161C`
- Muted text: `#55524B`

#### Swing

- Book: `#2F6FB5`
- Tint: `#E3EDF8`
- Text on tint: `#1E4F86`
- On dark: `#5B9BE0`

#### Long Game

- Book: `#F2A20C`
- Tint: `#FCEBC8`
- Text on tint: `#6B3F00`

Saffron is a fill with ink text, never text on white. The “Live” word in the logo may remain saffron.

#### Status

- Profit/done: `#2F7D4F`
- Profit tint: `#E3F1E8`
- Profit text: `#1F5E3A`
- Loss/rejected: `#B3261E`
- Loss tint: `#F6E3DC`
- Loss text: `#8A2E12`

### Usage rules

- Primary buttons use ink with white text.
- Active navigation uses raised ink and the relevant book dot.
- Book colour appears only as:
  - sidebar or navigation dot;
  - book tag or pill;
  - 4px top edge on book cards;
  - chart series and legend;
  - book rows in Reports.
- Distinguish multiple series from one book with line style, width, opacity, markers, and labels rather than unrelated hues.
- Status colours remain independent of book identity.
- Replace Mansel Live ad-hoc colours and inline colour styles with semantic tokens.

### Colour tests

Add a unit test that calculates contrast for every text/background token pair actually used and requires at least 4.5:1.

## 3. Build the Long Game book

## 3.1 Additive data model

Do not rewrite previously applied migrations. Add new migrations for:

- pocket money ledger;
- per-pocket ETF holdings;
- FIFO acquisition lots;
- suggestions;
- per-ETF suggestion plans;
- reconciliation events;
- suggestion and pocket references on Long Game decisions/orders where needed.

Supported pockets:

- `core`
- `radar`

Ledger events include:

- `deposit`;
- `withdrawal`;
- `opening_holding`;
- `income_units`;
- sale proceeds, charges, and tax entries where required for complete accounting.

Every mutation must produce an audit entry. Add idempotency keys or unique references for broker events, suggestions, approvals, fills, and reconciliation so retries cannot duplicate money or units.

Replace the current one-global-pending constraint with one pending suggestion per pocket.

Representative ETFs come from `RepresentativeEtfConfig` for:

- Nifty 50;
- Midcap 150 or Next 50;
- Gold;
- Liquid.

## 3.2 Isolate Swing before enabling Long Game

Create explicit Swing-scoped data access for:

- open positions;
- open cost;
- pending buy value;
- sent counts;
- buy pacing;
- marked exposure;
- sector counts;
- daily limits;
- EOD equity and breaker calculations;
- preflight reconciliation;
- freeze and T1 handling;
- P&L and reports.

All applicable queries must filter `book = 'swing'`.

Long Game:

- uses its own pocket ledger rather than `mlive_fund_ledger`;
- does not affect Swing fund balance;
- does not affect Swing spendable cash;
- does not affect Swing sizing;
- does not affect Swing gross exposure;
- does not consume Swing daily buy/sell limits;
- is excluded from Swing freeze, GTT fallback, and T1 logic.

Add regression tests proving that arbitrary Long Game deposits, holdings, suggestions, and pending orders do not change any Swing result.

## 3.3 Register existing holdings

Add a Long Game form with:

- pocket, default Core;
- ETF;
- units;
- average price;
- original purchase date.

Validation:

- read current Kite units;
- subtract all units already attributed across Core and Radar;
- reject registration above the remaining unassigned amount;
- handle settled and T1 quantities without applying Swing freeze logic;
- audit the registration and opening lot.

Register the owner's existing Nifty ETF in Core using its original purchase information.

## 3.4 Reconcile broker holdings

The daily sync compares aggregate Kite units with units attributed across Long Game pockets.

### Increase

- Match approved Long Game buy fills to their pocket.
- Treat valid Liquid ETF dividend units as `income_units`.
- Leave any other unexplained increase untracked and show it on the Long Game page with a Register link.

### Reduction

- Match approved Long Game sells to their pocket and suggestion.
- For an unexplained reduction, create one `needs_you` reconciliation event.
- If one pocket owns the ETF, preselect it.
- If multiple pockets own it, require a Core/Radar unit allocation.
- Display the actual fill value when available, otherwise the official close estimate.
- “Yes” applies FIFO lots, records realised gain and withdrawal, updates holdings, and audits the decision.
- “No” flags the event for investigation and performs no automatic accounting change.

Never silently reduce a pocket based only on aggregate Kite holdings.

## 3.5 Core suggestions

Run after the close on the first trading day of each month.

Create a suggestion only when:

- any sleeve is more than five percentage points from target;
- six months have passed since Core's last executed suggestion; or
- Core is empty and has never been entered.

Calculate the smallest no-sale top-up:

```text
max_i(current sleeve value_i / target weight_i) - current pocket value
```

Clamp the result to:

- `longterm_min_add = 10000`;
- `longterm_max_add = 100000`.

If capped, explain that the mix improves but is not fully restored.

Core does not sell unless the owner turns on the advanced “rebalance by selling” option for that suggestion. Keep it off by default and show its FIFO tax estimate.

## 3.6 Radar suggestions

Radar runs only after all activation guards pass.

- Refactor the frozen signal into a shared module used by both research and live proposal generation.
- Do not create a second signal implementation.
- Run daily after the close.
- On a target change, plan sells first and buys second.
- Reinvest sale proceeds through the same approved plan.
- New money is optional: ₹0 or ₹10,000–₹1,00,000.
- Radar's first entry suggests Core value clamped to ₹10,000–₹1,00,000.
- Require the funding confirmation checkbox only when optional new money is above ₹0.
- Cap approved Radar moves at `longterm_max_changes_per_year = 12` per calendar year.

## 3.7 Plan calculation

Each suggestion stores:

- pocket;
- reason and triggering drift or signal;
- current and target weights;
- suggested, minimum, maximum, and selected amount;
- per-ETF whole-unit plan;
- estimated charges;
- FIFO short-term and long-term tax estimate;
- expected spend and leftover;
- expiry date;
- rules version.

Amount behaviour:

- below suggested: allocate toward the sleeves furthest below target, proportional to their deficit;
- equal: use the calculated restoring plan;
- above suggested: restore the mix first, then split excess by target weights;
- whole units only;
- show leftover cash in Kite.

Add pure unit tests for below, equal, and above amounts, rounding, caps, and the empty-Core case.

## 3.8 Transactional approval

Approval must be atomic:

1. Lock and re-read the pending suggestion.
2. Confirm it is pending, unexpired, and belongs to the active rules version.
3. Revalidate activation, amount, range, and confirmation.
4. Record the pocket deposit when the selected amount is above ₹0.
5. Mark the suggestion approved.
6. Create Long Game decisions.
7. Commit all changes together.

Any failure rolls back the deposit, status change, and decisions.

Approval and order creation must be idempotent.

Rejecting or expiring a suggestion records the outcome but creates no deposit, decisions, or orders. A later suggestion is calculated fresh.

## 3.9 Orders and funds

- Use owner-authenticated approval only.
- Create normal Long Game decisions through the existing decision/order infrastructure.
- Keep Long Game order placement in its dedicated guarded path.
- Use CNC limit orders.
- Send sells before buys.
- Preserve existing safety checks and market-hour rules.
- No research, page load, sync, or suggestion calculation may place orders.

Immediately before buys:

- calculate planned buy requirements after whole-unit rounding and charges;
- read Kite available funds;
- if funds are insufficient, place no remaining buys;
- raise:

> Kite has ₹A available; this plan needs ₹B. Add funds or reduce the amount.

Do not use Long Game funds to alter Swing's spendable-cash calculation.

### Limit prices and order lifecycle

Use a fresh live quote and the instrument's Kite tick size whenever placing or repricing an order:

- buy limit: last price plus 0.3%, rounded up to the next valid tick;
- sell limit: last price minus 0.3%, rounded down to the previous valid tick;
- refuse placement or repricing when the quote or tick size is missing or stale.

For buys, the repriced quantity multiplied by its current limit plus estimated charges must remain within both the ETF's approved allocation and the suggestion's total approved amount. Never let an upward reprice spend more than the owner approved.

Use the existing sync cadence to inspect open Long Game orders and reprice remaining quantities every 15 minutes. Reuse infrastructure from the Momentum sell watcher where appropriate, but do not copy its aggressive 14:30 two-percent sell escalation: Long Game is not a forced liquidation.

Required sells must complete before dependent buys are sent. A partial or unfilled sell must not be silently covered with unrelated Kite cash. The normal Kite-funds check remains an additional safety guard.

Partial fills:

- update holdings, FIFO lots, charges, tax, and ledger entries for the filled quantity;
- leave only the unfilled quantity open;
- preserve the link to the original suggestion and pocket.

At 15:10:

- cancel every remaining Long Game order quantity;
- reconcile any final fill before recording cancellation;
- create a `needs_you` card showing filled and remaining units and the reason;
- do not carry the remainder automatically.

The owner may choose “Retry remaining next session” or “Stop here.” A retry:

- is a new owner action through the existing approved suggestion;
- recalculates valid whole units and limits from current prices without exceeding the original approved amount;
- creates normal next-session decisions;
- remains attached to the original suggestion;
- does not consume another Radar annual-change slot.

## 3.10 Activation

Ship with:

- `longterm` absent from `strategies_enabled`;
- `longterm_core_enabled = false`;
- `longterm_radar_enabled = false`.

Core requires:

- `strategies_enabled` contains `longterm`; and
- `longterm_core_enabled = true`.

Radar additionally requires:

- `longterm_radar_enabled = true`;
- `longterm_secondary = "mid"`;
- latest valid RADAR-MID held-back run passes the v3 drawdown condition.

The UI and engine must independently enforce these guards.

## 3.11 Long Game UI

### Book page

- “Long Game” header;
- saffron “Long Game book” pill;
- subtitle;
- one “Register existing holding” button;
- no withdrawal button;
- pending status strip;
- Core and Radar check descriptions;
- Radar move counter;
- total value, money added, gain, and Nifty 50 comparison tiles;
- Core and Radar cards with saffron top edge;
- ETF units and current allocation bars with dark target ticks;
- money added and pocket cash;
- explanatory note;
- untracked holdings note and Register link;
- history table.

### Suggestion page

- breadcrumb and pocket-specific title;
- ink banner with saffron Needs you badge;
- reason and expiry;
- amount input, ₹5,000 step controls, and amount chips;
- live whole-unit plan;
- charges, tax, spend, and leftover;
- confirmation;
- ink Approve button;
- Reject action and optional note;
- final status message.

### Today

- pending Long Game Needs you card;
- ink Review suggestion button;
- expiry date;
- Swing and Long Game cards use their book top edges and tags.

### Reports

- Long Game is a separate book;
- show Long Game P&L and Nifty 50 comparison;
- keep Swing totals unchanged;
- label Combined results clearly.

### Research

Move useful Long Game research comparison content from the current Long Game page into Research. The Long Game route becomes the live book page even while disabled, showing its inactive state and activation requirements.

## 4. Tests

Add or update tests for:

- `longgame-frozen-v3` exact override;
- no override, wrong version, wrong variants, grid, missing confirmation, and second use;
- successful `ok` completion consumes the override only after both result rows commit;
- crashes, failures, cancellations, and out-of-memory runs do not consume the override;
- research cannot create decisions;
- Core and Radar activation guards;
- Radar blocked when secondary is Next;
- Intraday retired and restored visibility;
- direct Intraday route behaviour;
- market-data and cron output;
- colour-token contrast;
- Swing isolation from Long Game money, holdings, decisions, and orders;
- opening-holding Kite limits;
- opening contribution and FIFO basis;
- unexplained withdrawal detection;
- multi-pocket attribution;
- actual fill versus close fallback;
- Liquid dividend income without withdrawal detection;
- Core amount formula and clamping;
- below/equal/above plan calculation;
- whole-unit rounding and leftover;
- atomic approval to deposit and decisions;
- approval retry idempotency;
- reject and expiry create nothing;
- Kite funds shortfall;
- directional tick rounding and the 0.3% limit policy;
- stale or missing quote refusal;
- 15-minute repricing without exceeding the approved amount;
- required sells blocking dependent buys until filled;
- partial-fill accounting;
- 15:10 cancellation and `needs_you` creation;
- retry remaining versus stop, without an additional Radar annual-change count;
- Radar annual cap;
- per-pocket pending uniqueness;
- Long Game exclusion from Swing freeze and T1 logic.

## 5. Migration and verification

Apply the new migrations without modifying or deleting existing data.

At the end of every phase, run:

```bash
npm run engine:test
npm run engine:build
npx eslint . --max-warnings 0
npm run build
```

Do not commit, proceed to the next phase, or push until all four commands pass.

### Pre-deployment Swing equivalence gate

Before deploying Phase B or later:

- confirm there are no unexpected open live positions, orders, or pending decisions outside the Swing book;
- snapshot the live Swing fund balance, open positions, open cost, marked equity, gross exposure, pending commitments, pacing counters, spendable cash inputs, freeze state, and T1 reconciliation inputs;
- run the updated calculations against the same database state;
- require identical results except for explicitly documented book filtering of non-Swing rows;
- confirm no migration changes an existing Swing row's strategy, book, amount, quantity, or status;
- keep Long Game activation settings off.

If equivalence cannot be demonstrated, deploy Phase A only and do not deploy Phase B, C1, or C2.

### Post-deployment checks

After the dark deployment:

- repeat the Swing snapshot and compare it with the pre-deployment values;
- inspect Thursday and Friday preflight, sizing, exposure, reconciliation, freeze, T1, and order logs;
- verify that no Long Game suggestion, decision, or order was created;
- verify that Intraday retirement stopped its live work while preserving daily market data;
- treat any unexplained Swing difference as a release blocker before Monday.

## 6. Delivery constraints

- Do not enable Long Game.
- Do not add `longterm` to `strategies_enabled`.
- Do not run research.
- Deployment is allowed only after all intended phases pass their verification and Swing equivalence gates.
- Deploy Long Game dark; deployment does not authorize activation or research.
- Do not modify Momentum or Swing behaviour except for explicit book-isolation fixes.
- Do not modify unrelated application sections.
- Keep Phase A, Phase B, Phase C1, and Phase C2 as separate commits and push only related files.

The final implementation handoff must include:

- a short summary;
- all new settings and their defaults;
- migration status;
- verification results;
- the exact held-back command.

## Exact held-back command

```bash
research --book longterm --heldback --confirm-heldback --owner-override longgame-frozen-v3 --no-grid --variant STATIC-MID,RADAR-MID
```
