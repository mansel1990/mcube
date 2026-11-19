# Mansel Live Visual Polish Follow-up Plan

**Baseline:** `f162898` plus the in-progress post-v3 completion work  
**Scope:** Mansel Live (`.mlive`) only  
**Type:** UI and data-presentation work only  
**Status:** implementation plan

## 1. Purpose

This pass finishes the owner-facing visual work that is still incomplete after the post-v3 refresh.

It covers:

- a distinct identity for Swing, Long Game, and Nifty 50;
- compact top-right Kite and mode indicators;
- a reliable and better-looking Auto action explanation;
- a redesigned Swing limits card;
- a better use of space on the Swing page;
- the approved minimal Research landing page;
- a more expressive Long Game Research comparison;
- the Long Game Off and On pages, adapted from the supplied PDFs;
- clearer dashboard summary cards;
- stable, intentional loaders on every Mansel Live page.

It does not change:

- trading rules;
- strategy settings;
- enabled strategies;
- signal generation;
- sizing;
- exposure;
- stops;
- order timing;
- order placement;
- approval behaviour;
- Swing accounting;
- Long Game activation guards.

Do not enable Core or Radar, change `strategies_enabled`, run research, or deploy.

## 2. Visual references and conflict resolution

Use these owner-supplied references:

```text
C:\Users\ADMIN\.cursor\projects\c-Projects-mcube\assets\image-cb82a479-7e89-47ca-afb5-405b190fca56.png

C:\Users\ADMIN\.cursor\projects\c-Projects-mcube\attachments\
8bf6599a-45c6-4e55-9a82-24c6b03d7fb9\
Long_Game_page___no_suggestion_pending.pdf

C:\Users\ADMIN\.cursor\projects\c-Projects-mcube\attachments\
8bf6599a-45c6-4e55-9a82-24c6b03d7fb9\
Long_Game___while_off__simplified_.pdf
```

The references establish composition, density, hierarchy, and tone. They are not all current on product scope.

Apply these precedence rules:

1. The later Core-only decision overrides both Long Game PDFs.
2. Radar remains in engine code, research data, guards, and tests.
3. Radar must not appear on a live Long Game page.
4. The new palette in this document overrides the previous rule that Swing is blue.
5. The old Swing blue becomes the Nifty 50 benchmark identity.
6. Green and red remain status colours, never book or benchmark identities.
7. Sidebar and phone navigation remain dot-free.

The live-state Long Game PDF therefore supplies:

- page rhythm;
- metric-card layout;
- status-strip treatment;
- sleeve-bar treatment;
- history-table density.

Do not copy from that PDF:

- the Radar pocket card;
- the Radar move counter;
- Radar cadence text;
- Radar history rows;
- its older Register button wording.

The Off-state PDF supplies:

- compact page header;
- dark hero;
- raised-ink holding tile;
- white primary and outlined secondary actions;
- restrained explanatory note.

Replace its Radar tile with a larger Core-only treatment. Do not leave a blank second column and do not introduce a substitute live pocket.

## 3. Updated colour system

### 3.1 Recommendation

Use blue for Nifty 50 and violet for Swing.

This gives each persistent financial concept a stable identity without borrowing the green/red status pair:

- Swing: violet;
- Long Game: saffron;
- Nifty 50: blue;
- neutral product chrome: ink;
- positive/done: green;
- loss/rejected/problem: red.

### 3.2 Exact tokens

Keep the existing neutral, Long Game, profit, and loss tokens.

Add or replace the identity tokens with:

```text
Swing
book       #6B4FB3
tint       #EEE9F8
text       #49367D
on dark    #B9A8F0

Nifty 50
benchmark  #2F6FB5
tint       #E3EDF8
text       #1E4F86
on dark    #5B9BE0

Long Game
book       #F2A20C
tint       #FCEBC8
text       #6B3F00
```

Contrast already checked for the proposed new pairs:

- Swing book on white: 6.19:1;
- Swing text on Swing tint: 8.37:1;
- Swing on-dark text on ink: 8.54:1;
- Nifty blue on white: 5.17:1;
- Nifty text on Nifty tint: 7.04:1;
- Nifty on-dark text on ink: 6.21:1.

### 3.3 Usage rules

Swing violet identifies:

- Swing card top edges;
- Swing chart series;
- Swing Research tab dot;
- Swing Research evidence-card edge;
- Swing pills and tags;
- Swing rows in Reports;
- Swing activity markers.

Nifty blue identifies:

- Nifty chart series and legend;
- Nifty comparison labels;
- the Nifty benchmark summary card;
- benchmark chips or tags;
- Nifty values in Research comparisons where identity is needed.

Long Game saffron identifies:

- Long Game card top edges;
- Long Game chart series and legend;
- Long Game Research tab dot;
- Long Game pills and tags;
- allocation bars;
- Long Game Reports rows.

Green/red identify a result or health state only:

- positive/negative numbers;
- pass/fail;
- done/rejected;
- connected/problem;
- order success/failure.

When a Nifty value is positive or negative:

- its label or series remains Nifty blue;
- its signed change may use profit or loss text colour.

Never use saffron, violet, or Nifty blue for a primary button. Primary buttons remain ink with white text.

### 3.4 Migration rule

Do not globally replace every existing blue literal.

Classify each use first:

- old `--swing` identity becomes violet;
- benchmark/Nifty uses become Nifty blue;
- generic open/info uses become a neutral semantic token;
- retired Intraday code remains untouched unless it leaks into a visible retired state.

Define the tokens once in:

- `app/(mlive)/mlive.css`;
- `lib/mlive/colours.ts`.

Update the contrast test to cover every text/background pair actually painted.

Add a visual-series test proving that Swing, Long Game, and Nifty resolve to three different colours and that Nifty remains dashed where it is a benchmark.

## 4. Shared compact health controls

### 4.1 Replace the current cluster

The current bordered three-part cluster still feels like a system console.

Use two small independent visual capsules at the top right:

```text
● Kite connected     ↻ Auto
```

Healthy background jobs do not need a permanent third capsule.

Show a jobs capsule only when attention is needed:

```text
! 2 jobs failed
```

That failure capsule links to Audit.

### 4.2 Appearance

Desktop:

- 30–32px visible height;
- 10–12px horizontal padding;
- 999px radius;
- 12px semibold label;
- 7px status dot or a 13px line icon;
- 6px gap between capsules;
- no containing outer border around the whole group.

Kite connected:

- very light profit tint;
- profit text;
- green status dot.

Kite login needed:

- loss tint;
- loss text;
- link or button to the existing login path.

Auto:

- raised-ink background;
- white text;
- compact circular-arrow icon.

Approve:

- neutral card background;
- ink text;
- subtle border.

Paused:

- loss tint if trading is blocked;
- otherwise a neutral warning treatment already present in the product.

Phone:

- keep only `Kite` and `Auto`/`Approve` in the dark header;
- preserve a visual 30–32px capsule;
- give an interactive capsule at least a 44px hit area without making its painted shape large.

### 4.3 Behaviour

- Labels come from actual connectivity and mode state.
- Do not show “connected” from stale cached data.
- Do not show jobs as healthy merely because no job data loaded.
- While job health loads, omit it rather than flash a false result.
- Failure takes precedence over compactness.

## 5. Auto action pill and explanation

### 5.1 Current problem

`Selling · auto` looks unfinished and its info control can fail to remain open.

The current focus/click interaction can open on focus and immediately toggle closed on click. A popover inside an overflow container can also be clipped.

### 5.2 New visual

Use one complete action pill:

```text
↓ Selling · Auto   ⓘ
```

or, before the send window:

```text
↓ Selling at open · Auto   ⓘ
```

The whole pill is the disclosure control. Do not place a second tiny button inside it.

Appearance:

- 36px painted height;
- 44px minimum interactive hit area;
- loss tint for a sell action;
- Swing tint for a buy action;
- strong status phrase;
- smaller `Auto` suffix;
- simple direction icon;
- no visible `Reason` label.

The symbol, quantity, and time stay in their normal position/Coming up row. The pill should not try to contain the entire decision.

### 5.3 Popover behaviour

The explanation must work with:

- mouse hover;
- keyboard focus;
- click;
- touch tap;
- Escape;
- outside click.

Implementation requirements:

- do not use a focus-open plus click-toggle sequence that immediately cancels itself;
- keep the popover open while the pointer moves from trigger to content;
- close after a short pointer-leave delay;
- use `aria-expanded`, `aria-controls`, and a labelled popover;
- return focus to the trigger after Escape;
- render through a portal or collision-aware layer so table/card overflow cannot clip it;
- flip above or sideways near viewport edges;
- constrain width to about 280px;
- use ink text on a white card with border and shadow;
- keep the original stored reason verbatim.

Phone:

- tap opens a small anchored sheet or popover;
- a second tap, outside tap, or Escape closes it;
- no hover dependency.

### 5.4 Placement

Auto mode:

- no Approve/Reject block;
- action appears in Coming up;
- action pill appears in the relevant position or idea row;
- actual failures are promoted to a needs-attention card.

Approve mode:

- retain the real owner action card;
- group Reject and Approve together;
- show the reason inline when space allows;
- use the disclosure only for extended detail.

## 6. Today summary cards

### 6.1 Shared treatment

Use a consistent card grammar:

- 18px radius;
- 18–20px padding;
- small uppercase or semibold label;
- one dominant value;
- one supporting comparison;
- aligned number baselines;
- no zero or em-dash content pretending to be useful data.

### 6.2 All books

- dark ink surface;
- white total;
- signed gain since start in profit/loss on-dark treatment;
- muted-light percentage line;
- no contribution/deposit counted as performance.

### 6.3 Today

- white card;
- amount and percentage on the same dominant line;
- profit/loss text based on sign;
- Nifty comparison as a small blue benchmark line;
- subtle status tint only, not a saturated card fill.

### 6.4 This month

- white card;
- rupee P&L as the dominant value;
- own percentage beneath it;
- Nifty comparison in a blue benchmark row;
- profit/loss text based on sign.

### 6.5 Versus Nifty 50

- Nifty blue 3–4px top edge or a very light Nifty tint header;
- percentage-point difference as the dominant value;
- signed difference still uses profit/loss text;
- `Us … · Nifty …` beneath it;
- use `pp`, not `%`, for the difference.

### 6.6 Responsive layout

Desktop:

- four aligned cards;
- All books may be slightly wider.

Phone:

- All books full width;
- Today, This month, and Versus Nifty in a three-card row only if labels and values remain readable;
- otherwise use a horizontally scrollable snap row;
- never squeeze labels into two-character columns.

## 7. Swing limits redesign

### 7.1 Replace plain paragraphs

The card should answer, at a glance:

- how much is invested;
- how much remains;
- whether position capacity is close;
- whether today's buy capacity is close.

### 7.2 Composition

Header:

```text
Swing limits                         ₹24,600 free
```

Primary allocation block:

```text
₹55,400 invested
70% of ₹80,000 Swing fund
[ violet invested bar | neutral free segment ]
```

Below it, use two compact capacity tiles:

```text
Open positions        3 of 5
Buys today             1 of 2
```

Each capacity tile has:

- label;
- current/maximum value;
- thin progress line;
- violet fill;
- neutral remainder.

### 7.3 States

- Normal limits use Swing violet.
- At the exact cap, use raised ink rather than red.
- Red is reserved for an actual violation or blocked action.
- If a maximum is unavailable, show the current count without inventing a cap.
- If the fund is unavailable, omit percentages and retain the known amounts.
- Add an accessible text equivalent for each meter.

### 7.4 Phone

- allocation remains full width;
- capacity tiles sit side by side;
- labels do not wrap below two lines;
- no miniature unreadable chart.

## 8. Swing page top-to-bottom

### 8.1 Header and summary

Keep the page title simple:

```text
Swing
```

Use the violet Swing identity on:

- the summary card top edge;
- book tags;
- position-card top edge;
- strategy Pilot state.

Do not add a large decorative hero.

### 8.2 Positions

Keep the positions table as the principal content.

Improve:

- violet top edge;
- clearer headers;
- compact P&L block;
- whole Auto action pill;
- working reason popover;
- horizontal scrolling on narrow widths;
- compact mobile rows.

### 8.3 Lower layout

Desktop:

- Today's ideas gets roughly 38% of the row;
- Strategies gets roughly 62%;
- 16–18px gap.

Phone:

- stack Today's ideas first;
- Strategies second.

### 8.4 Today's ideas

Header:

- title;
- compact count badge;
- bought count only when greater than zero.

Empty state:

- use a soft Swing-tint panel;
- small scan/clock icon;
- `No ideas yet`;
- `Next scan at 18:00`;
- no large `0 ideas · 0 bought` line;
- no excessive blank card height.

With ideas:

- symbol and strategy;
- one-line reason;
- decision state at the right;
- Auto action uses the new disclosure pill;
- Approve mode keeps actual action controls.

### 8.5 Strategies

Do not render three heavy cards inside another heavy card.

Use a light three-column strategy grid on desktop:

- RS Resilience;
- EMA Pullback;
- Momentum M10-6.

Each tile has:

- name;
- short lifecycle chip;
- one-sentence role or owner decision;
- metrics only when stored data exists;
- a restrained top rail.

Lifecycle presentation:

- Momentum: violet tint, `Live pilot`;
- stopped strategies: neutral tint, `Stopped`;
- parked research: neutral or Nifty-free technical tint, `Parked`;
- enabled non-pilot strategy: Swing tint, `On`.

Do not label an owner-stopped strategy merely `Off`.

Do not show:

```text
Profit factor — · per trade — · —
Live delivery book
```

When no metrics are available:

- omit the metric row;
- show the stored owner decision or `No current evidence summary`.

When metrics are available:

- use at most three compact values;
- include the sample label;
- do not mix building and held-back thresholds.

## 9. Research landing page

### 9.1 Match the supplied Swing reference

The first loaded view contains only:

1. `Research`;
2. Swing/Long Game segmented tabs;
3. one canonical evidence card;
4. collapsed `Retired and stopped (n)`;
5. collapsed Research archive below it.

Remove from the initial top area:

- explanatory subtitle;
- selected run metadata;
- Earlier runs control;
- New run button;
- loose historical strategy cards;
- owner-decision prose outside the evidence card.

### 9.2 Tabs

- right-aligned on desktop;
- track `#EAE5DA`;
- active tab white;
- 4px internal padding;
- 10–12px radius;
- small Swing-violet and Long-Game-saffron dots;
- active state stored in `?book=swing|longterm`;
- arrow-key navigation;
- full-width or left-aligned on narrow phone widths.

These Research dots are allowed. Navigation dots remain removed.

### 9.3 Swing evidence card

Use:

- white card;
- 18px radius;
- 4px violet top edge;
- Momentum M10-6 title;
- one-line description;
- compact `Live pilot ⓘ` chip;
- right-aligned held-back annual return;
- five softly tinted test tiles.

The title row should not be taller than the test grid needs.

Test tile:

- neutral warm background;
- no heavy border;
- green check or red cross;
- small metric label;
- large value;
- muted `Needs …` line.

For the canonical held-back M10-6 card:

```text
Profit factor 1.25
Needs 1.20
✓
```

Do not show the building threshold of 1.40 on the held-back card.

### 9.4 Pilot explanation

The Live pilot chip uses the same reliable disclosure primitive as Auto actions.

It must work on:

- hover;
- focus;
- click;
- touch;
- Escape.

The compact chip stays visible; the long owner explanation stays in the popover.

### 9.5 Retired and stopped

Use one collapsed `<details>` card.

Its count is derived from the displayed grouped records, not hardcoded.

Keep:

- Intraday ORB/VWAP grouped as the retired Intraday record;
- EMA Pullback;
- RS Resilience.

The closed state is a single clean row. The open state uses simple list rows, not nested full cards.

### 9.6 Research archive

Move:

- run summary;
- Earlier runs;
- New run;
- queued/running state;
- charts;
- trades;
- CSV;
- provenance;
- historical result cards;

into a collapsed `Research archive`.

New run remains available for Swing only and cannot float beside another page section.

Long Game Research remains read-only.

## 10. Long Game Research

### 10.1 Goal

Make Long Game Research visibly belong to Long Game without turning every cell saffron.

### 10.2 Header card

Use:

- 4px saffron top edge;
- light saffron-tint heading band;
- `Core vs Radar · Midcap 150`;
- loss-tint `Radar did not qualify` result pill;
- one-sentence conclusion;
- compact run 17 and override-consumed metadata.

### 10.3 Comparison layout

Desktop:

- two clearly labelled sample bands: Building and Held-back;
- Core and Radar columns inside each band;
- metric rows for return/year after tax, worst fall, recovery, and moves/year;
- held-back cells may use a slightly stronger tint because they drove the final decision.

Colour restraint:

- Core identity uses saffron edge/fill;
- Radar uses an outlined or patterned saffron treatment;
- failure conclusion uses loss tint;
- technical labels remain neutral;
- Nifty blue does not appear because Nifty is not a series in this comparison.

Phone:

- one metric card at a time;
- Building Core/Radar row;
- Held-back Core/Radar row;
- no unlabeled flattened table cells.

### 10.4 Worst-fall visual

Use the actual values:

- Core 12.5%;
- Radar 14.2%;
- 15% qualification cap.

Show:

- Core as a solid saffron bar;
- Radar as saffron outline or hatch;
- a dark 15% tick;
- value labels at the bar ends;
- one clear sentence explaining the failure.

Do not use green for Core and red for Radar merely to identify them. Red belongs only to the failed conclusion.

### 10.5 Progressive disclosure

Keep collapsed:

- How this decision was made;
- Run provenance;
- Stress tests;
- Superseded runs 9 and 10.

The landing card should communicate the conclusion without opening any of these.

## 11. Long Game Off page

### 11.1 Adapt the supplied Off PDF

Page header:

- `Long Game`;
- neutral grey `Off` pill;
- right-aligned info icon and `How it works`;
- no rule log or guard text.

Hero:

- ink background;
- 22px radius;
- about 28–30px desktop padding;
- saffron `Long Game book` pill;
- `Slow money in four ETFs. You approve every move.`;
- one raised-ink Core tile;
- actions beneath the tile.

### 11.2 Core-only tile

The PDF's second Radar tile must not be rendered.

Use one full-width Core tile containing:

- `Core · fixed mix`;
- current attributed value or `Empty`;
- `<ETF> <units> units, from your Kite` when present;
- a quiet `40 / 20 / 25 / 15` mix line.

On wide screens, the value and holding copy may sit in two columns inside this single tile. It remains one Core component.

### 11.3 Actions

Primary:

```text
Turn on Core
```

- white fill;
- ink text;
- confirmation dialog;
- existing audited settings path only.

Secondary:

```text
Register from Kite
```

- transparent fill;
- white border and text;
- opens the existing registration modal.

Below the hero:

> Once Core is on, this page becomes the live book.

Do not mention Radar, tests, activation gates, or strategy settings on this page.

## 12. Long Game On page

### 12.1 Top-to-bottom order

1. header;
2. suggestion status strip;
3. four metric cards;
4. one Core allocation card;
5. allocation explanation;
6. untracked holding note when applicable;
7. history.

### 12.2 Header

- `Long Game`;
- saffron `Long Game book` pill;
- `How it works` link at the right;
- no extra Register button in the main header;
- registration is offered only where relevant.

### 12.3 Status strip

No pending suggestion:

```text
● No suggestion waiting · next check Tue 1 Dec
```

Pending:

```text
Suggestion waiting · expires <date>     Review
```

Use profit/status green only for the healthy no-pending dot. Use saffron for the Review identity, but the Review button itself remains ink.

Do not show:

- Core guard state;
- Radar cadence;
- Radar move count;
- held-back qualification copy.

### 12.4 Metrics

Use four aligned cards:

- Total value;
- Money added;
- Gain;
- Nifty 50, same dates.

Treatment:

- value and money-added are neutral;
- gain uses profit/loss colour;
- Nifty label and comparison use Nifty blue/tint;
- missing benchmark data hides the fourth card rather than showing zero.

### 12.5 Core allocation card

Use:

- white card;
- 4px saffron top edge;
- `Core · fixed mix`;
- value and gain in the header;
- money added and pocket cash in a compact footer.

Desktop sleeve layout:

- two columns of two sleeves each to use the Core-only width;
- each sleeve remains a complete row/cardlet;
- Nifty 50, secondary equity, Gold, and Liquid;
- sleeve name;
- ETF;
- units;
- `now% / target%`;
- saffron allocation bar;
- dark target tick.

Tablet and phone:

- one sleeve per row;
- bars remain wide enough to interpret;
- no horizontal scrolling.

Keep a one-line explanation beneath the Core card:

> The bar is the current share; the dark tick is the target. Pocket cash normally stays at ₹0.

### 12.6 History

Use the PDF's calm table density:

- date;
- what happened;
- money added;
- status.

Do not show a Pocket column while Core is the only live pocket.

Status pills:

- Done: profit tint;
- Rejected: loss tint;
- Registered: neutral tint;
- Expired: neutral or loss tint according to the existing status semantics.

Hide the entire section when no history exists. Do not show an empty table shell.

## 13. Loaders

### 13.1 Shared rule

Every `.mlive` route must load into a skeleton matching its final page shape.

Do not show:

- raw `Loading…` text;
- a spinner in an otherwise blank page;
- half-rendered controls;
- stale content dimmed behind a fetch;
- sections appearing in request-completion order.

### 13.2 Required skeletons

Today:

- header and compact health capsules;
- four summary cards;
- chart and Coming up shapes;
- positions rows;
- lower cards.

Swing:

- title;
- summary strip;
- positions card;
- ideas and strategies shapes.

Research:

- title;
- tab control;
- one canonical evidence card;
- collapsed-row placeholder.

Long Game Off:

- title row;
- dark hero;
- one Core tile.

Long Game On:

- title/status;
- metric row;
- Core allocation card;
- history rows only when history is expected.

Reports, Charts, Audit, Settings, suggestion, and registration retain matching page-specific skeletons.

### 13.3 Accessibility

- one concise `role="status"` per loading page;
- skeletons `aria-hidden`;
- no focusable skeleton controls;
- no shimmer under `prefers-reduced-motion`;
- Retry action on initial-load failure;
- preserve page dimensions to avoid layout shift.

## 14. Responsive acceptance

Desktop reference width:

- verify at 1440px viewport;
- content remains fluid;
- no page section exceeds readable line length;
- Research evidence matches the compact supplied image;
- Long Game does not look empty after Radar removal.

Tablet:

- verify around 900px;
- summary cards wrap intentionally;
- tabs and health capsules do not collide;
- Core sleeve card shifts cleanly.

Phone:

- verify at 390px;
- 14px page padding;
- 12px section gaps;
- same content order as desktop;
- no separate reduced information architecture;
- 44px interactive targets;
- popovers remain inside the viewport;
- strategy tiles stack;
- Core sleeves stack;
- bottom navigation remains visible and dot-free.

## 15. Component and file map

Expected presentation files:

```text
app/(mlive)/mlive.css
lib/mlive/colours.ts
lib/mlive/colours.test.ts

components/mlive/reason-help.tsx
components/mlive/today-board.tsx
components/mlive/swing-view.tsx
components/mlive/research-view.tsx
components/mlive/research-dossier.tsx
components/mlive/long-game-book.tsx
components/mlive/loading.tsx
```

Data/view-model files may change only to expose already available presentation data:

```text
lib/mlive/today-board.ts
lib/mlive/research-page.ts
app/api/mlive/long-term/dossier/route.ts
app/api/mlive/long-game/book/route.ts
```

Do not cross the presentation boundary into engine strategy or execution behaviour.

## 16. Implementation phases

### Commit A: identity and shared interaction primitives

- add Swing violet and Nifty blue tokens;
- classify and migrate visible `.mlive` colour uses;
- update contrast tests;
- build the reliable disclosure/popover primitive;
- replace top-right health treatment;
- add shared loader primitives.

### Commit B: Research

- implement the supplied minimal Swing landing composition;
- use violet Swing identity;
- move run controls into Research archive;
- fix Live pilot disclosure;
- preserve correct per-sample thresholds;
- complete Long Game saffron hierarchy;
- complete the drawdown comparison;
- verify phone layouts.

### Commit C: Long Game

- adapt the Off PDF to Core only;
- complete the On page top-to-bottom;
- remove all live Radar remnants;
- improve metric, Core sleeve, note, and history presentation;
- retain registration and activation behaviour unchanged.

### Commit D: Today and Swing

- redesign summary cards;
- add Nifty benchmark identity;
- implement compact Kite/Auto capsules;
- move healthy job state out of permanent chrome;
- redesign Auto action pill and explanation;
- redesign Swing limits;
- redesign Today's ideas and Strategies;
- preserve Auto/Approve behaviour.

### Commit E: loaders, responsive, and visual acceptance

- finish route-specific skeletons;
- phone and tablet corrections;
- keyboard and touch tests;
- screenshot comparisons;
- full regression suite.

Keep each commit independently reviewable and green.

## 17. Tests

### Colours

- all used text pairs meet 4.5:1;
- Swing, Long Game, and Nifty have distinct identity tokens;
- no book identity uses green or red;
- primary buttons remain ink;
- navigation has no identity dots;
- Nifty benchmark series remains distinguishable without colour alone.

### Health

- connected versus login-required;
- Auto versus Approve versus Paused;
- healthy jobs omitted from permanent capsules;
- failed jobs shown and linked to Audit;
- no false healthy flash during loading.

### Auto explanation

- hover opens;
- focus opens;
- click/tap opens;
- first click does not immediately close;
- Escape closes and restores focus;
- outside click closes;
- popover is not clipped by overflow;
- reason is accessible to assistive technology;
- Auto mode shows no approval actions;
- Approve mode retains them.

### Swing

- zero-idea state omits `0 ideas · 0 bought`;
- next scan time is displayed;
- strategy lifecycle comes from stored decisions;
- stopped strategies are not labelled merely Off;
- missing metrics omit the metric row instead of showing dashes;
- Momentum uses Swing violet;
- limits use the Swing fund and existing caps only.

### Research

- initial header contains title and tabs only;
- old long pilot label is absent;
- canonical M10-6 card is first;
- held-back PF threshold is 1.20;
- retired/stopped count is derived;
- archive is closed initially;
- New run stays inside Swing archive;
- Long Game has no New run;
- Long Game result and run 17 data remain correct.

### Long Game

- Off page contains no Radar;
- On page contains no Radar;
- one Core-only holding tile while Off;
- one Core-only allocation card while On;
- status strip has no guard log;
- Nifty metric uses benchmark blue;
- empty history is hidden;
- untracked holding note appears only when data exists;
- registration and activation requests are unchanged.

### Loaders and responsive

- every named `.mlive` route has one stable skeleton;
- skeleton section order matches loaded section order;
- reduced motion disables shimmer;
- no skeleton is focusable;
- phone order matches desktop order;
- every interactive phone target is at least 44px;
- popovers fit a 390px viewport.

## 18. Visual acceptance checklist

Capture and compare:

- Today Auto at 1440px;
- Today Approve at 1440px;
- Today at 390px;
- Swing with no ideas;
- Swing with at least one Auto decision fixture;
- Swing with known and missing Research metrics;
- Research Swing loaded;
- Research Swing Live pilot popover;
- Research archive open;
- Research Long Game loaded;
- Long Game Off with an attributed NIFTYBEES holding;
- Long Game Off empty;
- Long Game On with no suggestion;
- Long Game On with a pending suggestion;
- Long Game Register modal;
- loaders for Today, Swing, Research, and Long Game;
- Kite login failure;
- failed jobs.

Compare hierarchy and density, not literal sample values.

## 19. Verification and delivery

Run after every phase:

```bash
npm run engine:test
npm run engine:build
npx eslint . --max-warnings 0
npm run build
```

Before pushing:

- all four commands pass;
- browser screenshots pass the acceptance checklist;
- Core remains off;
- Radar remains off and hidden live;
- `strategies_enabled` is unchanged;
- no research was run;
- no server deployment was performed;
- only `.mlive`-related files and this plan are included.

Final handoff should state:

- completed sections;
- chosen Swing and Nifty tokens;
- test/build results;
- viewport widths checked;
- any metric or schedule value unavailable from stored data;
- confirmation that trading behaviour was not changed.
