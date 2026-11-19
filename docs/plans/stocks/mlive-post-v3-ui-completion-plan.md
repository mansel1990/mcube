# Mansel Live Post-v3 UI Completion Plan

**Baseline commit:** `f162898`  
**Parent specification:** `docs/plans/stocks/mlive-post-v3-ui-refresh-plan.md`  
**Scope:** Mansel Live (`.mlive`) only

## Why this completion pass exists

The post-v3 refresh delivered much of the data plumbing and component structure, but the pushed UI does not yet meet the approved presentation.

Confirmed gaps:

- Research still shows the old long `Live pilot · owner's choice · did not pass all tests` label in historical cards and verdict copy.
- Research run controls appear loose in the header, and stopped EMA/RS cards clutter the first view.
- Research loading is visually unstable.
- Long Game Research lacks the planned saffron hierarchy, worst-fall visual, and polished mobile comparison.
- The standalone Long Game page has the correct broad states but incomplete composition and styling.
- Today uses three generic chips for system health.
- Dashboard summary cards do not use enough visual hierarchy or status colour.
- Auto-mode planned sells still resemble owner approval cards.
- Several Today desktop and phone sections remain only partially implemented.

This document is a focused completion plan. It does not replace or rewrite the parent specification.

## Reference HTML

The only Mansel Live HTML mockup currently committed is:

```text
docs/plans/stocks/mockups/mlive-ui-mockup.html
```

It is a legacy sample:

- dark-first;
- red generic accent;
- JetBrains Mono;
- old Home/Charts/Reports/Settings navigation;
- no Research dossier;
- no Long Game surface.

Do not pixel-match its colours, typography, navigation, or old information architecture.

Reuse only its stronger presentation principles:

- dedicated status controls instead of generic chips;
- cohesive hero composition;
- clear card hierarchy;
- disciplined spacing;
- compact timelines and activity rows;
- intentional empty states.

The parent post-v3 plan remains the source of truth for current colours, fonts, books, and page structure.

## Scope guard

This is a presentation completion pass.

Do not change:

- trading rules;
- strategy settings;
- signal generation;
- sizing;
- exposure;
- stops;
- order send windows;
- order placement;
- decision outcomes;
- Swing accounting;
- Long Game activation guards.

Do not enable Core or Radar, change `strategies_enabled`, run research, or deploy on the server.

## 1. Shared loading system

### Problem

Initial page loads currently show raw loading text, incomplete fragments, stale content at reduced opacity, or controls before their containing surface is ready.

### Shared primitives

Create reusable `.mlive` loading components:

- skeleton line;
- skeleton label;
- skeleton number;
- skeleton card;
- skeleton metric tile;
- skeleton table rows;
- skeleton chart;
- compact inline spinner for a submitted button only.

### Behaviour

- Preserve the approximate dimensions of the final page.
- Avoid layout shift when real content appears.
- Use page, card, raised-ink, and border tokens only.
- Use a subtle neutral shimmer or pulse.
- Disable animation under `prefers-reduced-motion`.
- Skeleton shapes are `aria-hidden`.
- Expose one concise `role="status"` message per loading page.
- Replace the complete skeleton state when essential page data is ready.
- Do not reveal unrelated fragments in request-completion order.
- Initial-load failures show a clear error card with Retry.

### Required page loaders

- Today;
- Swing;
- Long Game;
- Reports;
- Charts;
- Research;
- Audit;
- Settings;
- registration modal after opening;
- suggestion detail.

### Research loader

Show:

- title skeleton;
- book-tab skeleton;
- one canonical evidence-card skeleton.

Do not render Run history, New run, loose metadata, or candidate cards while loading.

### Tests

- loaders preserve the final section order;
- one accessible status is announced;
- skeletons are not focusable;
- reduced motion disables shimmer;
- error state exposes Retry;
- loaded content replaces rather than appends to skeletons.

## 2. Research landing page cleanup

### Default header

The first Research view should be intentionally small:

- `Research`;
- Swing/Long Game tablist.

Remove from the primary header:

- `The evidence behind what is live, parked, or stopped.`;
- selected run summary;
- Earlier runs;
- New run.

The first useful content after the header is the canonical evidence for the selected book.

### Research archive

Move every run-management control into one collapsed card below canonical evidence:

```text
Research archive
```

Use `<details>` and keep it closed by default.

Inside:

- latest/selected run metadata;
- Earlier runs selector;
- New run action for Swing only;
- queued/running status;
- historical run cards;
- parameter grids;
- charts;
- trades;
- CSV;
- run provenance.

The New run button must remain inside this card at desktop and phone widths. It must never float or hang beside an unrelated header or section.

Long Game has no New run action.

### Canonical Swing first view

Show only the Momentum M10-6 canonical evidence card.

Do not show loose EMA Pullback and RS Resilience cards under Momentum. Move stopped and retired strategies into:

```text
Retired and stopped (<count>)
```

If active research candidates are introduced later, put them in a separate collapsed `Other candidates` section.

### Remove the old pilot label

Remove all live rendering and tests for:

```text
Live pilot · owner's choice · did not pass all tests
```

Use:

```text
Live pilot ⓘ
```

The explanation opens on hover, keyboard focus, and tap.

Replace a visible `Reason` word with an info icon having an accessible label. The explanation is connected with `aria-describedby` and closes with Escape.

The canonical card, historical cards, verdict copy, and tests must use the same lifecycle presentation model.

### Canonical card

Keep:

- 4px Swing-violet edge;
- Momentum M10-6;
- one-line description;
- short Live pilot chip;
- held-back annual return;
- canonical held-back run metadata;
- five structured test tiles;
- owner decision;
- View evidence.

### Correct test threshold

Every metric must use the requirement for its own sample:

- building metrics use building rules;
- held-back metrics use held-back rules;
- never use the selected historical run's threshold for the canonical result.

For M10-6:

```text
Profit factor 1.25
Needs 1.20
✓ Pass
```

The 1.40 requirement belongs to the building sample and must not be shown on this held-back card.

### Acceptance

- primary header contains only title and tabs;
- no subtitle or run metadata above canonical evidence;
- Research archive is closed initially;
- New run is contained in Swing archive only;
- EMA/RS are absent from the first view;
- old long pilot label is absent from rendered UI and tests;
- no visible `Reason` word is used as the tooltip trigger;
- first load has no layout jump.

## 3. Long Game Research visual completion

### Data boundary

Create a dedicated read-only Research view model or endpoint.

Do not fetch live-book fields such as:

- activation state;
- pending live suggestion;
- live lock state;
- live actions.

Read only:

- canonical building run;
- run 17 held-back results;
- comparison metrics;
- rules version;
- consumed override;
- superseded run metadata;
- frozen owner conclusion.

Long Game Research cannot POST or queue work.

### Card hierarchy

Use:

- 4px saffron top edge;
- white body;
- subtle Long Game tint in the title/decision band;
- loss-tint `Radar did not qualify` result pill;
- Long Game text token on saffron tint;
- neutral technical detail sections.

Do not introduce unrelated variant colours. Distinguish Core and Radar with labels, line style, pattern, weight, and density.

### Header

Show:

```text
Core vs Radar · Midcap 150
Radar did not qualify
Core remains the fixed 40/20/25/15 Long Game book.
Run 17 · Held-back 1 Jan 2024–18 Nov 2026 · Override consumed
```

### Comparison matrix

Desktop:

| Metric | Building Core | Building Radar | Held-back Core | Held-back Radar |
| --- | ---: | ---: | ---: | ---: |
| Return/year after tax | stored | stored | 12.78% | 8.89% |
| Worst fall | stored | stored | 12.5% | 14.2% |
| Recovery | stored | stored | stored | stored |
| Moves/year | 0 | stored | 0 | 4.5 |

Use stored values rather than duplicating fixed copy in the component.

Phone:

- one metric block at a time;
- visible metric label;
- Building Core/Radar row;
- Held-back Core/Radar row;
- no unlabeled single-column cell stack.

### Worst-fall visual

Add a compact horizontal comparison:

- Core: 12.5%;
- Radar: 14.2%;
- dark tick at 15%;
- saffron identity;
- Core solid;
- Radar patterned or outlined.

Decision copy:

> Radar needed a drawdown no higher than 15% and lower than Core. It reached 14.2%, versus Core's 12.5%, so it did not qualify.

Secondary note:

> 65% of Radar's profit came from gold, indicating concentrated contribution.

### Progressive disclosure

Keep collapsed:

- How this decision was made;
- Run provenance;
- Stress tests;
- Superseded runs 9 and 10.

### Acceptance

- visible saffron edge and title treatment;
- correct Long Game text colour on tint;
- complete run window;
- worst-fall visual and cap marker;
- useful mobile metric labels;
- no live-book API coupling;
- no run action;
- superseded runs preserved.

## 4. Standalone Long Game page completion

### Off page composition

Use one cohesive dark hero instead of unrelated stacked blocks.

Inside the dark ink hero:

- saffron `Long Game book` pill;
- `Slow money in four ETFs. You approve every move.`;
- raised-ink Core tile;
- Core value;
- `<ETF> <units> units, from your Kite` or `Empty`;
- white filled Turn on Core button;
- outlined Register from Kite button.

Below:

> Once Core is on, this page becomes the live book.

Header:

- Long Game;
- properly styled grey Off pill;
- info icon plus How it works link.

### On page

Finish:

- styled status strip;
- proper Review button;
- four aligned metric tiles;
- Core-only card;
- sleeve rows;
- saffron allocation bars;
- dark target ticks;
- money added;
- pocket cash;
- clean history rows;
- hide empty history.

### Suggestion page

Replace the fixed preview/stub with the real Core suggestion presentation already backed by v3 data:

- actual suggestion amount;
- current versus target weights;
- whole-unit plan;
- charges and tax estimate;
- confirmation;
- Approve/Reject;
- no Radar tab or copy.

Do not change the approval or order logic.

### Core-only API presentation

The live presentation model should expose Core fields only.

Radar engine code, research data, tests, and activation guard remain unchanged.

### Acceptance

- dark hero reads as one component;
- Off pill is visibly neutral;
- Turn on Core is white-filled;
- How it works includes an accessible info icon;
- pocket cash appears;
- sleeve rows have intended hierarchy;
- Review is styled as a control;
- suggestion page uses stored suggestion data;
- no Radar live text or controls.

## 5. Today health cluster

### Replace three generic chips

Do not render three unrelated `.chip` elements for:

- Kite connected;
- Auto mode;
- Last night's jobs ok.

Use one cohesive status cluster:

```text
● Kite connected  |  ↻ Auto  |  ✓ Jobs ok
```

Desktop treatment:

- white surface;
- subtle border;
- 14px radius;
- minimum 40px height;
- compact semibold labels;
- 8px indicators;
- vertical separators;
- right-aligned;
- green only for healthy status;
- loss tint for Kite login or failed jobs;
- raised ink emphasis for Auto/Paused where helpful.

Phone:

```text
Kite · Auto
```

Keep job failure visible as an Audit/problem control.

### Header completion

Add:

- latest Nifty state and move;
- market countdown from the trading calendar;
- schedule-aware job health.

Do not use the Long Game next-check date as the market's next session.

Do not mark weekend/holiday jobs as failed when they were not expected.

## 6. Today summary-card redesign

### Shared card grammar

- radius 18px;
- 18–20px padding;
- aligned number baselines;
- clear label, primary value, supporting comparison;
- status text colours;
- no arbitrary saturated backgrounds.

### All books

- ink background;
- white label and value;
- muted-light since-start text;
- show flow-aware gain amount when derivable;
- do not count deposits/opening contributions as returns.

### Today

- white card;
- P&L amount and percentage as primary value;
- profit text for gains;
- loss text for losses;
- Nifty comparison in muted text;
- optional small status-tint strip/badge.

### This month

- white card;
- ₹ P&L as primary value;
- percentage secondary;
- Nifty comparison muted;
- profit/loss text by sign.

### vs Nifty 50

- white card;
- relative percentage points as primary value;
- profit/loss text by sign;
- `Us … · Nifty …` muted.

Hide a comparison that cannot be derived from matching dates.

## 7. Auto actions and approval cards

### Auto mode

A proposed Auto decision is not an owner-action card.

Do not show:

```text
Selling at open · auto
HEROMOTOCO
Reason
```

as a loose top-of-page block.

Instead:

- add the action to Coming up;
- show the compact state pill in the relevant position row;
- include the reason in Coming up or behind an info icon;
- reserve the top action area for login, failure, investigation, and genuine owner decisions.

If an Auto order fails or is rejected, promote it to a loss/problem card because it genuinely needs attention.

### Approve mode

Use a cohesive approval card:

- side/status tint rail or pill;
- symbol, quantity, and planned time as the primary row;
- readable reason as secondary text;
- Skip and Approve grouped together;
- no floating `Reason` word;
- optional info icon for extended detail.

### State accuracy

- proposed before window: Buying/Selling at open · auto;
- sent/open: Buy/Sell order open;
- partial: `<filled> of <total> bought/sold`;
- complete/skipped/rejected/cancelled: stored state.

Do not continue saying “at open” after sending.

## 8. Today remaining completion

### Growth chart

- add Long Game saffron series when EOD data exists;
- keep Swing violet;
- keep Nifty blue and dashed;
- normalize visible series from a common date;
- add legend with visible returns;
- hide absent series rather than drawing zero.

### Coming up

- decision send windows;
- schedule events;
- weekday labels;
- next Momentum picks;
- Long Game monthly check when Core is on;
- at most six rows;
- hide the card when there is nothing useful.

### Swing positions

- add desktop column headers;
- horizontal scrolling;
- open-position count;
- correct next-state pill;
- compact phone rows.

### Lower row

Use three desktop columns:

1. Swing limits;
2. Long Game;
3. Recent activity.

Swing limits:

- invested amount/percentage;
- free cash;
- open positions versus cap;
- buys today versus cap;
- Swing-violet/neutral thin bars.

Long Game:

- money added;
- value and gain;
- sleeve bars;
- target ticks;
- actual monthly next-check date or Review.

Recent activity:

- five desktop rows;
- three phone rows;
- relative time;
- plain language;
- Swing violet marker;
- Long Game saffron marker;
- system grey marker;
- loss red marker for exits/stops.

### Summary completeness

- Today includes matching Nifty percentage;
- This month includes ₹ P&L and percentage;
- All books includes a flow-aware gain amount where possible;
- relative-performance label uses `pp`.

## 9. Phone completion

Use the same section components and order as desktop.

Required order:

1. dark phone header;
2. All books full-width;
3. Today/month/Nifty cards;
4. growth chart;
5. Coming up;
6. Swing positions;
7. Swing limits;
8. Long Game;
9. Recent activity.

Fix:

- All books must not be squeezed into the three-small-card row;
- three recent activity items must actually render;
- Long Game uses a stacked mix bar;
- chart is 150px;
- legend wraps;
- every target is at least 44px.

Bottom navigation remains:

```text
Today · Swing · Long Game · Reports · More
```

No book-colour dots appear in desktop or phone navigation.

## 10. Implementation phases

### Commit A: loading and Research cleanup

- shared loading primitives;
- Research skeleton;
- compact header;
- archive containment;
- remove old pilot label;
- move stopped strategies;
- threshold correctness.

### Commit B: Research and Long Game visual completion

- dedicated Long Game Research model;
- saffron dossier;
- comparison matrix;
- worst-fall visual;
- standalone Long Game off/on composition;
- suggestion page completion.

### Commit C: Today completion

- health cluster;
- summary cards;
- Auto action placement;
- chart series/legend;
- Coming up;
- positions;
- limits;
- Long Game card;
- activity.

### Commit D: phone and acceptance

- responsive corrections;
- loader coverage on remaining routes;
- keyboard and contrast;
- browser verification;
- regression tests.

Run required verification after every commit.

## 11. Test plan

### Research

- clean initial header;
- archive collapsed;
- New run contained;
- no old pilot label;
- no visible Reason trigger text;
- EMA/RS moved to retired/stopped;
- correct held-back threshold;
- loader stability;
- Long Game dossier colours and bar;
- mobile matrix labels;
- read-only Long Game endpoint.

### Long Game

- cohesive off hero;
- neutral Off state;
- correct actions;
- info link;
- pocket cash;
- Core-only API/UI;
- real suggestion values;
- Radar remains hidden live and present in research.

### Today

- cohesive health cluster;
- health failure states;
- status-coloured summary values;
- benchmark text treatment;
- no Auto pseudo-approval card;
- Auto action in Coming up and position row;
- Approve card actions;
- Long Game chart line and legend;
- three-column lower row;
- activity times and markers;
- correct phone item counts.

### Loading and accessibility

- all named routes have a skeleton;
- no raw Loading text;
- one status announcement;
- no skeleton focus targets;
- reduced motion;
- dialogs/tooltips/tabs/details keyboard access;
- contrast at least 4.5:1.

## 12. Visual acceptance

Verify with browser screenshots at desktop and phone widths:

- Research Swing initial load and loaded state;
- Research archive open;
- Research Long Game;
- Long Game Off;
- Long Game On fixture;
- Long Game registration;
- Core suggestion;
- Today Auto desktop;
- Today Approve desktop;
- Today phone;
- failure states for Kite and jobs.

Do not approve the push solely from source tests. Compare the rendered result against this completion plan and the parent specification.

## 13. Verification

Run:

```bash
npm run engine:test
npm run engine:build
npx eslint . --max-warnings 0
npm run build
```

Do not commit or push until all four pass.

## 14. Delivery constraints

- `.mlive` only.
- Do not enable Core.
- Do not enable Radar.
- Do not alter `strategies_enabled`.
- Do not run research.
- Do not deploy on the server.
- Do not change trading or order behaviour.
- Keep commits scoped to the phases above.
- Push only related files.

Final handoff:

- summary by commit;
- tests and build results;
- browser widths checked;
- screenshots or a clear rendered-state report;
- anything unavailable from stored data;
- confirmation that Long Game remains off;
- confirmation that research and deployment were not run.
