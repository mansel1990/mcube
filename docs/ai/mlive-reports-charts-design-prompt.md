You are working in `C:\Projects\mcube` on Mansel Live. The P&L model (`lib/mlive/pnl.ts`, `/api/mlive/pnl`) is fine. **This task is a design and usability pass on Reports → P&L, Reports → Trades and Charts.**

- Keep the numbers and tests. Change the UI, plus the few data fixes listed below.
- Check every change in the browser at `http://localhost:3000/live-trade-mansel/reports` and `/charts`, at 1440 px and 390 px wide, in light and dark.
- Keep `npm run engine:test`, `npm run lint` and `npm run build` green.

## Problems seen on the running page (fix all)
1. **Numbers use a typewriter or monospace font.**
    - Use the app font (the mockup's Inter or system stack) everywhere.
    - For numbers, use `font-variant-numeric: tabular-nums` and never a mono family.
    - Remove every `font-family: monospace`, `ui-monospace` and `.mono` from mlive numbers.
2. **Alignment is broken.**
    - Text columns (labels, stock, period) are centred or right-aligned in the middle of the table.
    - Card titles ("Period statement", "Capital statement", "Where the money went") sit flush in the card corner with no padding, or float on the right.
    - **Rule:** card padding 20 px (16 px on mobile). The title is top-left, 15 px semibold. Controls are top-right on the same row as the title. Text columns are left-aligned, numeric columns right-aligned, and column headers align with their data.
3. **The charge table shows rows of ₹0.00.** Only show charge types that are non-zero in the current filter. Group them for readability:
    - **Taxes** (STT + stamp + GST);
    - **Brokerage**;
    - **Exchange & SEBI**;
    - **DP**.

   Each group expands to show its parts.
4. **All charges go into "Brokerage" when a position has no charge items** (the fallback in `pnl.ts` around line 506, `charges.brokerage = paise(position.charges)`).
    - Put the total in an **"Unclassified"** bucket instead, labelled "Not split yet".
    - Never invent a category.
    - After migrations 005 and 006 there should be no unclassified charges. Add a test for that.
5. **Remove** "175.4% of gross", and any "% of gross" or "% of turnover" figure from the cards. Keep % of turnover only inside the expanded charges detail.
6. **Remove the "Where the money went" waterfall.** Replace it with the **P&L breakdown card** (§A2).
7. **Realised and unrealised P&L must be visible at the top** (§A1).
8. **Charts show weak visuals with little data:**
    - a single giant red bar, a lone dot, and "2026-W46" week labels;
    - "Strategy face-off" text mashed to the right.

   See §B for the fixes.
9. **The charts page froze the browser for about 30 s** when scrolling.
    - Profile it.
    - Memoise derived data (`useMemo`) and give charts fixed heights.
    - Use `isAnimationActive` only on first mount, and lazy-mount cards below the fold (IntersectionObserver).
    - Don't recompute `buildPnl` per card.

## Colour system (use everywhere, in light and dark)
Define these CSS variables once in `mlive.css`:
- `--profit` (green), `--profit-bg` (green at 10% alpha);
- `--loss` (red), `--loss-bg`;
- `--charges` (amber), `--charges-bg`;
- `--open` (blue, for unrealised and open positions), `--open-bg`;
- `--neutral`.

Use them like this:
- **Positive money:** `--profit` text with ▲ or a "+". **Negative money:** `--loss` text with ▼ or a "−". Never use colour alone.
- **Cards:** a 3 px top accent bar in the card's colour, and a tinted background for the key number's chip.
- **Strategy colours stay:** `--rs`, `--ema`.

## A. Reports → P&L tab
### A1. Top summary (4 large cards, then 4 small ones)
**Large cards, 2×2 on mobile:**
- **Total P&L:** net realised + unrealised.
    - Big number in profit or loss colour, with a chip showing the % of capital.
    - Subline: "Realised +₹26 · Open +₹114".
- **Realised P&L:** net of charges, for closed trades.
    - Subline: "1 closed trade · gross +₹44 · charges ₹18".
- **Unrealised P&L:** open positions at the live price, in `--open` styling.
    - Subline: "1 open · ₹19,262 invested".
- **Charges paid:** amber.
    - Subline: "₹18 on ₹34,183 traded".

**Small cards:** Win rate (wins/losses) · Profit factor · Avg win / Avg loss · Capital deposited.

Each card has an ⓘ button with a popover showing the formula in plain words. Use a button with a popover, not a `title` attribute.

### A2. P&L breakdown card (replaces the waterfall)
A single horizontal stacked bar, sized to absolute values, with segments in this order:
1. Realised gross (profit or loss);
2. Charges (amber, shown as a deduction);
3. Unrealised (blue).

Under the bar, a three-row statement:
```
Closed trades   gross +₹44.10   charges −₹18.14   = realised +₹25.96
Open positions  at live price                     = unrealised +₹113.60
                                                   ─────────────
Total P&L                                          +₹139.56
```
Then "Charges detail ▸", which expands to the grouped charge rows (non-zero only), each with ₹ and % of total charges.

### A3. Period statement
- Title row: "Statement" on the left; on the right a segmented Day / Week / Month / All control and a "CSV" ghost button.
- Period labels are human-readable:
    - Day: "Mon, 9 Nov";
    - Week: "9–13 Nov";
    - Month: "Nov 2026";
    - never "2026-W46" or "2026-11".
- Columns: Period (left), Trades, Won, Gross, Charges, Net, Running total.
    - Net and Running total are coloured, and Charges is in amber.
- The totals row is bold, with a top border.
- Clicking a row expands it to show that period's trades as mini rows.

### A4. Capital statement
An accounting layout: left-aligned labels, right-aligned amounts, and subtotal lines with a top rule.
```
Starting capital                 ₹80,000.00
+ Later deposits                      ₹0.00
− Withdrawals                         ₹0.00
+ Realised P&L (after charges)      +₹25.96
− Charges on open positions         −₹22.98
= Trading limit                  ₹80,002.98
  Open positions at cost         ₹19,262.40
+ Unrealised P&L                   +₹113.60
= Account value                  ₹80,116.58   (bold, larger)
```
- Hide zero rows except Starting capital.
- Never print "₹-0.00". Format negative zero as ₹0.00, and write negatives as "−₹10.29", with the sign before the ₹.

### A5. Strategy table
RS and EMA rows, each with its colour dot, then trades, win rate, realised, unrealised, charges, PF, avg R and avg days. Grey out a row with 0 trades and show "No trades yet" in it.

## B. Reports → Trades tab (the most important table)
- **Layout:** two sections on one page, **Open positions** first, then **Closed trades**. Each has a count badge and a totals row.
- **Row design** (desktop table; on mobile each row becomes a card):

| Column | Content |
|---|---|
| Stock | **SYMBOL** (semibold), with a strategy chip (RS/EMA colour) and the exit or status pill underneath. Pills: "Open", "Trend stop", "Stop hit", "Safety sell", "Manual", "Breaker". |
| Entry → Exit | Two lines: `9 Nov · ₹2,438.50` and `9 Nov · ₹2,444.80`, with a small → between them. Open rows show the live price and "live". |
| Qty · Days | `7 sh · 0 d`. Intraday shows an "Intraday" chip. |
| Stop | The initial stop and the current stop. For open rows, the GTT status dot (green = active in Kite, red = missing). |
| Gross | Coloured. |
| Charges | Amber. A hover shows the grouped breakdown. |
| **Net** | The biggest number in the row, in profit or loss colour, with **Net %** under it. |
| R | e.g. `+1.4R`. Show "—" with a tooltip "Bought below its stop" when R is null. |

- **Row accents:** each row has a 3 px left border in profit or loss (blue for open) and a very light tinted background on hover.
- **The "Bought below stop" badge** is a small amber warning chip next to the symbol. It must not push columns around.
- **Sorting and filtering:** sortable headers with a ▲▼ indicator. Filter chips above the table: All / RS / EMA · Won / Lost · Exit reason. A search box for the symbol.
- **Totals row** per section: sum of gross, charges and net, plus the win rate.
- **Detail:** clicking a row opens the existing trade panel.
    - The panel's price strip is a horizontal scale with labelled markers for stop, entry, exit, best and worst price.
    - Fills and charge items are listed as rows.
- **Empty states:** "No open positions" and "No closed trades yet", each with a one-line hint.

## C. Charts page
Global controls (Range 1M / 3M / All, Strategy All / RS / EMA) go top-right, next to the page title.

1. **Hero:**
    - Left: the account value (40 px), and the Total P&L chip (₹ and %) for the range. Under it, small tiles for Realised, Unrealised, Charges and Deposited.
    - Right (wide): a gradient area chart of account value.
        - A dashed baseline at starting capital, labelled "₹80,000 start".
        - X labels like "9 Nov"; Y ticks like "₹80.1k".
        - A tooltip card with the date, value and change from the start.
        - With fewer than 3 points, draw the points joined by a line, plus a caption: "Builds up after a few trading days."
2. **Stat strip:** 6 equal cards with a 3 px accent bar:
    - Win rate (with a W–L line);
    - Profit factor;
    - Expectancy;
    - Avg win / Avg loss;
    - Avg days held;
    - Drawdown, shown as "0.0% of 25% breaker" with a thin progress bar. This is the only place drawdown appears.
3. **Trade results:**
    - A horizontal bar per closed trade, labelled with the symbol and date, coloured by profit or loss, with the strategy as a dot.
    - A Net ₹ / Net % / R toggle.
    - With 1–3 trades, bars are capped at 28 px thick, not stretched to fill the card.
4. **P&L over time:** cumulative realised net (solid) and gross (dashed), with the gap shaded `--charges-bg` and labelled "Charges".
    - X axis: dates.
    - With fewer than 2 closed trades, show an empty state card instead of a chart.
5. **By period:** bars for net P&L per **week** (labelled "9–13 Nov"), or per month once there are 8+ weeks.
    - Bars are capped at 40 px wide and centred. The y-axis always includes 0.
6. **Strategy face-off:** two equal columns, RS (left) and EMA (right). Each has:
    - a coloured header bar;
    - a big net P&L;
    - rows for trades, win rate, PF, expectancy, avg days and charges.

   All text is left-aligned within its column. A column with 0 trades shows "No trades yet" in muted text.
7. **Open positions now:** one mini card per open position.
    - The symbol, the unrealised ₹ and %, and a small bar from stop to the current price, with the entry marked.
    - The GTT dot.
8. **Why we sold:** a donut with the count in the centre and a legend table showing count and net per reason. Needs 3 closed trades; until then, show a chip list.
9. **Charges:** a donut of grouped charge types (Taxes, Brokerage, Exchange & SEBI, DP), plus the total in the centre. Only non-zero groups.
10. **Later cards** (R distribution, days vs return, best price vs result, money at work, rolling form) stay, but collapse into one **"More analysis"** section.
    - Each card shows a compact empty state ("Needs 5 closed trades · you have 1") instead of an empty axis.

**Remove** any "Down from peak" chart (none should remain), plus all "2026-W46" or "2026-11" style labels.

## D. Data fixes in this task
- **Charges fallback:** use the Unclassified bucket from item 4, with a test.
- **Negative zero:** `formatInr` never prints "−₹0.00". Test this.
- **Sign placement:** money formats as "−₹10.29" and "+₹25.96", consistently. One `formatInr(value, { sign: true })` helper is used everywhere. Test it.
- **Labels:** helpers `periodLabel(kind, key)` and `shortDate(iso)`, both tested.

## Done means
- Paste the test, lint and build output and the diff.
- Attach screenshots of Reports → P&L, Reports → Trades and Charts at 1440 px and 390 px, light and dark.
- The screenshots must show:
    - no ₹0.00 charge rows;
    - no mono font;
    - every card title padded top-left;
    - realised and unrealised visible at the top.
