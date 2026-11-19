# Mansel Live Post-v3 UI and Research Refresh

**Context:** Long Game v3 shipped in `2e85bea` and remains disabled.  
**Scope:** Mansel Live (`.mlive`) only.  
**Nature of work:** UI and data presentation, plus the owner decision that live Long Game is Core-only.

## Objective

Apply the approved post-v3 mockups and make the live state of Mansel Live immediately understandable:

- make Auto mode look automatic;
- record that Radar did not qualify and remove it from live UI;
- simplify the disabled and enabled Long Game pages;
- register existing holdings directly from Kite;
- turn Research into a modern evidence dossier;
- make Today a full, responsive dashboard;
- use the same information architecture on desktop and phone;
- remove book-colour dots from navigation.

Do not change trading rules, strategy settings, order logic, Momentum behaviour, Swing behaviour, or Long Game activation guards.

## Fixed visual system

Use the existing v3 colours without changing their values:

- Ink: `#14161C`
- Raised ink: `#2A2D36`
- Page: `#F6F4EF`
- Card: `#FFFFFF`
- Border: `#E4DFD3`
- Muted text: `#55524B`
- Swing: `#2F6FB5`
- Swing tint: `#E3EDF8`
- Swing text: `#1E4F86`
- Long Game: `#F2A20C`
- Long Game tint: `#FCEBC8`
- Long Game text: `#6B3F00`
- Profit: `#2F7D4F`
- Profit tint: `#E3F1E8`
- Profit text: `#1F5E3A`
- Loss: `#B3261E`
- Loss tint: `#F6E3DC`
- Loss text: `#8A2E12`

Typography:

- Space Grotesk for headings and large numbers;
- Inter for body copy, controls, labels, and tabular data.

Use white cards, hairline borders, restrained or no shadows, no gradients, generous whitespace, and concise product language.

## Chosen clarification decisions

### Auto-mode decision states

The UI must describe the actual decision/order state rather than showing approval controls or a generic future message.

For proposed decisions in Auto mode:

- proposed sell before its send window: `Selling at open · auto`;
- proposed buy before its send window: `Buying at open · auto`.

After execution processing begins:

- open order: `Sell order open` or `Buy order open`;
- partial fill: `<filled> of <total> sold` or `<filled> of <total> bought`;
- completed, skipped, cancelled, or rejected: show the corresponding stored outcome.

Do not continue saying “at open” after an order has been sent.

In Approve mode, retain the existing Approve and Reject controls.

Reason help must work on hover, keyboard focus, and tap. Do not rely only on a native `title` attribute.

### Core activation

The “Turn on Core” button is part of the UI, but this implementation must not click it or activate Core.

When the owner uses it later:

- show a confirmation dialog;
- preserve every existing strategy in `strategies_enabled`;
- add `longterm` only if absent;
- set `longterm_core_enabled = true`;
- perform both setting updates atomically through the audited settings path;
- never enable Radar.

Rendering the page, opening the confirmation, testing, migration, or deployment must not alter either setting.

### Unknown acquisition date

When “Bought around” is blank:

- store `acquisition_date = null`;
- store the registration date;
- store `tax_date_assumption = "registration_plus_12_months"`;
- do not invent a purchase date;
- conservatively estimate the lot as short-term until 12 months after registration;
- show the assumed long-term date in tax-estimate explanations.

This affects estimates only and must not alter trading behaviour.

### Combined performance

Do not present deposits or opening contributions as investment gains.

- Combined gain equals current value minus net contributed capital, with realised withdrawals and income treated consistently with the ledgers.
- Percentage returns must use the existing flow-aware/per-book return calculation where available.
- If a comparable flow-aware return cannot be derived, omit the percentage rather than calculate a misleading raw percentage.
- Today and month comparisons use matching date windows for Mansel Live and Nifty 50.
- Label relative performance in percentage points, for example `+2.4 pp`, not “points.”

### Common chart start

When multiple series are shown, normalize them from the latest first date shared by every visible series.

- Hide a series with no data in the selected range.
- If Long Game has no EOD history, do not render a zero line.
- Recalculate the common start when the selected range changes.

### Research lifecycle statuses

Do not infer `stopped`, `retired`, or `parked` merely from absence in `strategies_enabled`.

Create a presentation-only, versioned decision registry or equivalent stored model containing:

- strategy/variant identifier;
- lifecycle status: `live_pilot`, `parked`, `retired`, or `stopped`;
- owner-facing label;
- decision date;
- short reason;
- optional detailed accessible explanation.

Research metrics continue to come from stored runs. The retired/stopped count is calculated from the rendered decision records, not hard-coded.

### Long Game Research is read-only

The Long Game Research tab shows the completed evidence and decision record.

- It has no New run action.
- It does not POST to the research queue.
- It cannot create research requests, decisions, suggestions, or orders.
- The canonical Long Game conclusion remains fixed when browsing historical runs.

## 1. Auto mode presentation

### Issue

The engine auto-sends proposed decisions in Auto mode, but Today and Swing currently show approval language and buttons.

### Implementation

Create one pure presentation helper that receives:

- engine mode;
- decision side;
- decision outcome;
- order status;
- ordered and filled quantities;
- send-window state;
- reason text.

Return a structured view model:

- label;
- tone;
- accessible explanation;
- whether approval controls are allowed.

Use it in Today, Swing, desktop, and phone views.

Auto-mode proposed states:

- sell pill: loss tint and loss text;
- buy pill: Swing tint and Swing text.

Approve mode retains current controls and owner workflow.

### Tests

- Auto mode never renders Approve or Reject for proposed decisions.
- Approve mode renders both controls.
- Sell and buy labels and tones are correct.
- Open, partial, complete, skipped, cancelled, and rejected states override future-tense labels.
- Reason help is keyboard and touch accessible.

## 2. Record the Radar conclusion and make live Long Game Core-only

### Decision record

Record under `longgame-frozen-v3`:

> Radar did not qualify on 18 Nov 2026 (run 17). Radar is parked as research only. The override is consumed.

Held-back run 17:

- window: 2024-01-01 through 2026-11-18;
- STATIC-MID CAGR: 13.15%;
- STATIC-MID after-tax CAGR: 12.78%;
- STATIC-MID maximum drawdown: 12.5%;
- RADAR-MID CAGR: 8.89%;
- RADAR-MID after-tax CAGR: 8.89%;
- RADAR-MID maximum drawdown: 14.2%;
- RADAR-MID moves per year: 4.5;
- RADAR-MID profit contribution from gold: 65%.

The rule required Radar drawdown at most 15% and lower than Static on the same window. Radar passed the cap but failed to beat Static: 14.2% versus 12.5%.

### Live scope

Keep all Radar engine code, tests, research data, migrations, and guards.

Hide Radar from live UI:

- no Radar pocket card;
- no Radar move counter;
- no Radar status/guard text;
- no Radar choice in registration;
- no Radar suggestion tab;
- no Radar settings control;
- no Radar live rows in Today or Reports.

Registration always targets Core.

Keep:

- `longterm_radar_enabled = false`;
- the engine Radar activation guard;
- Radar evidence in Research.

### Rules page

At `/about/rules#long-game`, present:

- Core fixed mix: 40% Nifty 50, 20% Midcap 150, 25% Gold, 15% Liquid;
- Core is the only live Long Game scope;
- one short paragraph recording the Radar result and why it failed.

Avoid a long research log on the public rules page.

### Tests

- Radar conclusion and run number are shown in rules.
- Radar is absent from every live component and setting.
- Radar research evidence remains visible.
- Radar code and engine guard remain present.
- Register targets Core without exposing a pocket selector.

## 3. Long Game page

Remove rule, guard, and diagnostic prose from the product page.

Add one `How it works` link with an info icon:

```text
/about/rules#long-game
```

### Off state

Header:

- `Long Game`;
- grey `Off` pill;
- How it works link at top right.

Hero:

- dark ink card;
- radius 22px;
- padding 30px;
- saffron `Long Game book` pill;
- title: `Slow money in four ETFs. You approve every move.`

Core tile:

- raised-ink background;
- current Core value;
- `<ETF> <units> units, from your Kite`;
- `Empty` when no Core holding exists.

Actions:

- white filled `Turn on Core`;
- outlined `Register from Kite`.

Footer line:

> Once Core is on, this page becomes the live book.

### Core activation confirmation

Dialog copy must state exactly what changes:

- Core suggestions will begin;
- every move still needs owner approval;
- `longterm` will be added to enabled strategies;
- Radar remains off.

The confirm action uses the atomic audited settings operation described above.

### On state

Header:

- saffron `Long Game book` pill;
- How it works link.

Status strip:

- `No suggestion waiting · next check Tue 1 Dec`; or
- `Suggestion waiting · expires <date>` and Review button.

Show:

- total value;
- money added;
- gain;
- Nifty 50 over the same dates;
- one Core card;
- history table.

Core card:

- 4px saffron top edge;
- value and gain;
- one row per sleeve;
- sleeve name, ETF, units;
- `now% / target%`;
- saffron allocation bar;
- dark target tick;
- money added;
- pocket cash.

Hide empty history and empty optional sections rather than rendering zero rows.

### Suggestion page

Keep the v3 Core suggestion experience and remove the Radar tab and all Radar copy.

## 4. Register from Kite

### Dialog

`Register from Kite` opens an accessible modal:

- focus moves into the dialog;
- focus is trapped;
- Escape closes;
- closing restores focus to the trigger;
- backdrop click may close only when no submission is pending.

### Eligible holdings

List only configured Long Game ETFs with unattributed Kite units:

- symbol;
- unattributed units;
- Kite average price;
- current value.

Units and average price are read-only.

If exactly one holding is eligible, select it automatically.

Do not remove NIFTYBEES from Swing `exclude_symbols`.

### Optional month

Field:

```text
Bought around
```

Use a month picker and help text:

> Only used for tax estimates. Kite doesn't share purchase dates.

If provided, store a month-level acquisition estimate using a documented convention such as the first day of the selected month and mark it as estimated. If omitted, use the unknown-date decision above.

### Optional Console tradebook

Add a secondary action:

```text
Upload Console tradebook (CSV)
```

Hint:

> Console › Reports › Tradebook, filter the ETF, full date range.

Parse Zerodha Console tradebook CSV rows for the selected ETF:

- trade date;
- buy or sell;
- quantity;
- price.

Ignore rows for other symbols. Rebuild the currently open holding as FIFO lots by adding buys and applying sells against the oldest remaining buy units first.

The reconstructed remaining units must equal the current unattributed Kite units being registered. If they differ:

- show the reconstructed units, Kite units, and difference;
- explain that the full trade history may be incomplete;
- do not create the registration or any lots;
- allow the owner to remove the file and use the optional-month fallback.

On an exact unit match:

- show a preview of the remaining FIFO lots;
- store one opening lot for each remaining buy lot, including its real trade date, remaining units, and actual price;
- calculate money added as the sum of each remaining lot's units multiplied by its purchase price;
- show the reconstructed weighted average beside Kite's average for comparison;
- use the tradebook dates for tax estimates;
- record a SHA-256 checksum of the uploaded file in the audit;
- never store the raw CSV or its unrelated rows.

The owner must confirm the preview before registration. The server must repeat symbol, quantity, and current unattributed-Kite-unit validation at confirmation time.

When a valid tradebook is selected, its exact lots take precedence over the optional month. Without a file, keep the optional month and the 12-months-after-registration assumption.

### Submit

Button:

```text
Add <units> units to Core
```

Success:

> Added to Core. Gains are counted from ₹<average>.

Keep:

- server-side validation against current unattributed Kite units;
- idempotency;
- opening-lot creation;
- audit record.

### Empty state

> No Long Game ETFs in your Kite yet.

Add one short explanation that only configured, unattributed Long Game ETFs appear here.

### Tests

- only configured and unattributed ETFs appear;
- single result auto-selects;
- units and average price cannot be edited;
- month is optional;
- known-month and unknown-date assumptions are stored;
- multi-buy tradebook reconstructs one opening lot per remaining buy;
- partial sells consume lots in FIFO order;
- wrong-symbol tradebook rows are ignored;
- reconstructed units must exactly equal the unattributed Kite units;
- unit mismatch shows the difference and creates no registration;
- valid tradebook dates and prices determine money added and tax lots;
- the audit stores the file checksum but the raw CSV is not retained;
- tradebook lots take precedence over the optional month;
- submission cannot exceed current unattributed units;
- success and empty states render correctly;
- every registration targets Core.

## 5. Research evidence dossier

### Information architecture

Research has two product-level tabs:

- Swing;
- Long Game.

Intraday appears only under the collapsed retired/stopped section.

URL state:

```text
?book=swing
?book=longterm
```

Historical run selection may add `run=<id>`, but it affects only the run-detail area. It must not rewrite the canonical owner decision shown at the top.

### Header

Left:

- `Research`;
- `The evidence behind what is live, parked, or stopped.`

Right:

- Swing/Long Game tablist;
- Run history;
- New run on Swing only.

Tab styling:

- `#EAE5DA` track;
- white active tab;
- small blue Swing dot;
- small saffron Long Game dot.

Use:

- `role="tablist"`;
- `role="tab"`;
- `aria-selected`;
- `aria-controls`;
- left/right arrow-key navigation;
- at least 44px tap targets.

These Research tabs and charts are permitted uses of book-colour dots.

### Canonical summary versus run detail

Split the page into:

1. canonical decision summary;
2. historical run archive/detail.

The canonical summary aggregates the owner-approved decision and the latest applicable completed evidence. It does not change when an older run is selected.

Run detail may show:

- selected run metadata;
- charts;
- settings variants;
- monthly returns;
- trades;
- CSV export;
- provenance.

### Research view model

Build a server-side presentation model rather than deriving the decision from whichever run happens to be selected.

Suggested structure:

```text
book
decision status
decision label and explanation
decision date
canonical building run
canonical held-back run
headline return
structured tests
candidate summaries
retired/stopped records
selected run detail
```

Structured test item:

```text
id
label
value
requirement
passed
```

Do not pass preformatted test sentences to the card.

### Swing canonical card

Card:

- white;
- radius 18px;
- 4px Swing-blue top edge.

Header:

- `Momentum M10-6`;
- one-line strategy description;
- `Live pilot ⓘ` chip;
- headline held-back annual return aligned right.

Evidence metadata:

```text
Held-back evidence · Run <id> · <window> · data through <date>
```

Tooltip:

> Running with real money by owner's choice. It passed 3 of 5 tests: short on trade count (140 of 150) and profitable half-years (3 of 5). Small size, stop rule agreed.

The tooltip opens on hover, keyboard focus, and tap, is connected with `aria-describedby`, and can be dismissed with Escape.

### Five-test grid

Desktop: five columns.  
Phone: two columns.

Each tile contains:

- green ✓ or red ✗;
- short label;
- measured value;
- requirement.

Test requirements must come from the rules for the same sample as the metric being shown:

- building-sample metrics use the building-sample requirements;
- held-back metrics use the held-back requirements;
- never compare a metric from one sample with another sample's threshold;
- prefer thresholds persisted with the canonical run;
- for an older run without persisted thresholds, resolve them from its stored book, sample, and versioned rules rather than from the currently selected run.

The canonical M10-6 card shows held-back evidence. Its held-back profit factor is 1.25 and its held-back requirement is 1.20, so this tile must show a pass. The 1.40 profit-factor requirement belongs to the building sample and must not be used on this card.

Examples:

```text
✓ Profit factor
1.25
Needs 1.20
```

```text
✗ Trade count
140
Needs 150
```

Recommended labels:

- Profit factor;
- Trade count;
- Profitable half-years;
- Worst fall;
- Average net per trade.

### Swing card footer

Show:

- `3 of 5 tests passed`;
- `Small-size live pilot`;
- `Owner decision · <date>`;
- explicit `View evidence` control.

Do not make the entire card a button when it contains interactive controls.

### Other Swing candidates

Show non-live candidates as smaller evidence cards:

- name;
- one-line description;
- lifecycle chip and accessible explanation;
- tests passed count;
- headline return;
- View evidence.

Do not promote every parameter-grid variation to a primary card.

### Retired and stopped

At the bottom:

```text
Retired and stopped (<calculated count>)
```

Compact rows:

- Opening Range — Retired 18 Nov 2026 — PF 0.71;
- VWAP — Retired 18 Nov 2026 — PF 0.34;
- EMA Pullback — Stopped — owner reason/date;
- RS Resilience — Stopped — owner reason/date.

Values come from the decision registry and stored research results.

### Long Game canonical card

Card:

- white;
- radius 18px;
- 4px saffron top edge.

Header:

- `Core vs Radar · Midcap 150`;
- loss-tint `Radar did not qualify` pill;
- `Core remains the fixed 40/20/25/15 Long Game book.`

Decision metadata:

```text
Run 17 · Held-back 1 Jan 2024–18 Nov 2026 · Override consumed
```

### Long Game comparison matrix

Use a five-column matrix for readability:

| Metric | Building Core | Building Radar | Held-back Core | Held-back Radar |
| --- | ---: | ---: | ---: | ---: |
| Return/year after tax | stored | stored | 12.78% | 8.89% |
| Worst fall | stored | stored | 12.5% | 14.2% |
| Recovery | stored | stored | stored | stored |
| Moves/year | 0 | stored | 0 | 4.5 |

Read all metrics from stored run results. The fixed values above are acceptance checks, not a substitute for loading data.

On small screens, render each metric as a compact stacked comparison row rather than shrinking the table text.

### Worst-fall visual

Add a compact comparison bar:

- Core: 12.5%;
- Radar: 14.2%;
- dark marker at the 15% cap.

Use saffron as the Long Game series identity and distinguish Core/Radar by fill density, line style, or labels rather than a second book colour.

Decision sentence:

> Radar needed a drawdown no higher than 15% and lower than Core. It reached 14.2%, versus Core's 12.5%, so it did not qualify.

Secondary note:

> 65% of Radar's profit came from gold, indicating concentrated contribution.

### Progressive disclosure

Keep technical evidence collapsed:

- How this decision was made;
- Run provenance;
- Stress tests;
- Superseded runs 9 and 10.

Preserve the existing superseded-run explanation.

### Long Game endpoint behaviour

Do not embed the live `LongTermView` inside Research.

Create a dedicated read-only Long Game research view model backed by:

- `mlive_research_runs`;
- `mlive_longterm_results`;
- stored comparison data;
- frozen v3 conclusion metadata.

The Research POST route remains Swing-only from this UI.

### Research tests

- URL selects Swing and Long Game.
- Arrow keys change tabs.
- canonical decision does not change when browsing an old run;
- New run appears only for Swing;
- Long Game cannot queue research;
- status tooltip works with keyboard and touch;
- test tiles derive icons, values, and requirements from structured data;
- every test metric is evaluated against the threshold for that metric's own sample;
- M10-6 held-back profit factor 1.25 passes the held-back 1.20 requirement;
- headline return comes from the canonical held-back result;
- retired/stopped count derives from records;
- Long Game matrix loads stored building and held-back values;
- run 17 conclusion and override state render;
- superseded runs remain collapsed.

## 6. Today desktop dashboard

Use a fluid main area:

- horizontal padding: 32px;
- vertical padding: 28px;
- gap: 18px.

### Header

Left:

- `Thursday, 19 Nov`;
- market state/countdown;
- latest Nifty 50 close or live state and move.

Right health pills:

- Kite connected or Kite: log in;
- Auto mode, Approve mode, or Paused;
- Last night's jobs ok or `<n> jobs failed`.

The failed-job pill links to Audit.

Market countdown must use the trading calendar, holidays, and market session times.

Job health must compare completed jobs with schedule-aware expected jobs. Do not mark an unscheduled holiday/weekend job as failed.

### Four summary tiles

1. All books:
   - dark ink;
   - Swing plus Long Game value;
   - flow-aware gain and return since common start.
2. Today:
   - P&L and percentage;
   - matching Nifty percentage.
3. This month:
   - P&L and percentage;
   - matching Nifty percentage.
4. vs Nifty 50 since start:
   - relative result in percentage points;
   - `Us +a% · Nifty +b%`.

Use profit/loss text colours for values.

Hide a comparison if the required window or benchmark data cannot be derived.

### Growth since start

Two-column row: 3fr chart and 2fr Coming up.

Chart:

- Swing blue, 3px;
- Long Game saffron, 3px;
- Nifty grey `#B8B3A8`, dashed;
- returns normalized from a common date;
- 1M, 3M, All;
- legend includes each visible return.

Use per-book EOD series and Nifty daily candles. Hide unavailable series.

### Coming up

Build a server-side, time-ordered presentation model combining:

- planned decisions;
- actual decision send windows;
- schedule entries;
- next Momentum selection;
- Long Game monthly check when relevant.

At most six rows. Use a 64px time column.

Examples:

- `09:15 Sell HEROMOTOCO · 3 shares · Auto · closed below its trend stop`;
- `20:05 Save market data`;
- `Fri 20:40 Momentum picks`.

Do not duplicate trading timing rules in JSX. Read them from existing schedule/decision helpers.

### Swing positions

Card:

- 4px blue top edge;
- `<n> open` pill;
- Open Swing link.

Columns:

- stock;
- strategy;
- quantity;
- average;
- last;
- P&L amount and percentage;
- stop;
- days held;
- next state.

Use the shared decision-state presentation helper. Add horizontal scrolling on constrained widths.

### Three-column lower row

Swing limits:

- invested percentage and amount;
- free cash;
- open positions versus limit;
- buys today versus limit;
- thin blue or neutral bars.

Long Game:

- 4px saffron top edge;
- Core total and gain;
- sleeve bars and target ticks;
- next suggestion date or Review action;
- hide if no useful Long Game data exists.

Recent activity:

- latest five audit events;
- mapped to plain owner-facing language;
- relative time;
- blue Swing, saffron Long Game, grey system, or red exit/stop marker.

Use a centralized audit-event formatter with a safe fallback for unknown actions.

### Empty-state rule

Hide optional empty sections and unavailable comparisons. Do not render placeholder zeros that imply real activity.

Intraday remains absent while `intraday_retired = true`.

## 7. Phone parity

Use the same data model, section components, and DOM order as desktop. Prefer responsive CSS and small presentational variants over a separate reduced dashboard.

Order:

1. dark header;
2. All books;
3. Today, month, and Nifty comparison tiles;
4. growth chart;
5. Coming up;
6. Swing positions;
7. Swing limits;
8. Long Game;
9. Recent activity.

Phone styling:

- page padding 14px;
- gap 12px;
- 150px chart;
- three compact summary tiles in one row where width permits;
- wrapped legend;
- compact position rows;
- three recent activity entries.

Compact position row:

- symbol;
- `qty × last · stop`;
- P&L amount and percentage;
- next-state pill below symbol when relevant.

Long Game phone card uses one stacked mix bar plus a text summary.

All controls and navigation targets are at least 44px.

Sticky bottom navigation:

```text
Today · Swing · Long Game · Reports · More
```

## 8. Navigation colour rule

Remove book-colour dots from:

- desktop sidebar;
- phone bottom navigation;
- More navigation.

Active navigation:

- raised ink background;
- white semibold text;
- no book-colour dot.

Book colour remains only on:

- book pills/tags;
- 4px book-card top edges;
- chart series and legends;
- Research tabs;
- Reports book rows.

Update the colour-usage test and any documentation that still requires active-navigation dots.

## 9. Data presentation boundaries

This task may add read-only aggregation and presentation helpers for:

- research dossiers;
- dashboard summaries;
- chart normalization;
- scheduled-event descriptions;
- health status;
- audit-event language;
- registration eligibility.

It must not change:

- signal generation;
- strategy selection;
- sizing;
- exposure;
- stops;
- order send windows;
- order placement;
- order repricing;
- decision outcomes;
- Swing fund accounting;
- Long Game activation guards.

The only setting mutation introduced is the explicitly requested owner action to turn on Core through the existing audited settings path.

## 10. Test plan

### Decisions

- Auto versus Approve controls.
- Correct proposed, open, partial, completed, skipped, cancelled, and rejected labels.
- Accessible reason help.

### Core-only Long Game

- Radar absent from all live UI and settings.
- Radar evidence remains in Research.
- Core activation leaves existing strategies intact.
- Rendering and deployment do not activate Core.
- Registration always targets Core.

### Registration

- only eligible unattributed ETFs;
- read-only units and average price;
- optional month;
- unknown-date tax assumption;
- current-unit validation;
- focus trap and focus restoration;
- success and empty states.

### Research

- URL-backed tabs;
- keyboard tab navigation;
- canonical summaries independent of selected historical run;
- accessible status explanations;
- structured test tiles;
- calculated retired/stopped count;
- read-only Long Game dossier;
- run 17 conclusion;
- stored comparison values;
- collapsed technical evidence.

### Today

- flow-aware per-book and combined values;
- common-start chart normalization;
- range filtering;
- schedule-aware market and job health;
- Coming up from decisions and schedule;
- empty optional sections hidden;
- Intraday absent;
- plain-language audit activity.

### Responsive layout

- desktop and phone render the same sections in the same order;
- compact position rows;
- chart and legend;
- sticky bottom navigation;
- 44px minimum targets.

### Colours and accessibility

- no navigation dots;
- permitted book-colour usage only;
- text contrast remains at least 4.5:1;
- dialogs, tooltips, tabs, details, and controls are keyboard accessible;
- reduced-motion preferences are respected.

## 11. Verification

Run:

```bash
npm run engine:test
npm run engine:build
npx eslint . --max-warnings 0
npm run build
```

Do not commit or push until all commands pass.

## 12. Delivery constraints

- Mansel Live only.
- Do not enable Core.
- Do not enable Radar.
- Do not change `strategies_enabled` during implementation, tests, migration, or deployment.
- Do not run research.
- Do not deploy on the server.
- Do not change trading rules, strategy settings, order logic, or Swing behaviour.
- Commit and push only files related to this task.
- Do not accidentally include unrelated or previously untracked files.

Final handoff:

- short summary for sections 1–8;
- tests and build results;
- list any metric, date, health state, or comparison that could not be derived from stored data;
- confirm Core and Radar remain disabled;
- confirm no research or server deployment was run.
