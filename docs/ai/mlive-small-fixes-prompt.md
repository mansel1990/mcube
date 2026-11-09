You are working in `C:\Projects\mcube` on Mansel Live. Make a few small UI fixes only, with no logic changes. Check each one in the browser at `http://localhost:3000/live-trade-mansel/reports` (P&L and Trades tabs) and `/charts`, at 1440 px and 390 px wide, in light and dark. Keep `npm run engine:test`, `npm run lint` and `npm run build` green.

1. **Trades filter bar overflows.** The last exit chip ("Breaker") is hidden under the CSV button.
    - Lay the bar out as a wrapping flex row: search, then the three chip groups with a 1 px divider between groups, and CSV pushed right with `margin-left: auto`.
    - Chips wrap to a second line instead of sliding under CSV. Nothing overlaps at any width from 390 px to 1440 px.
    - On mobile, the exit-reason chips scroll sideways inside their own group (`overflow-x: auto`, no visible scrollbar).
2. **Trade results value label is unreadable.** The "−₹10.29" label sits inside the red bar in faint red.
    - Draw the value **outside** the bar end: right of a positive bar, left of a negative bar.
    - Use 12 px semibold in the normal text colour (profit or loss colour only for the sign).
    - Keep it inside the chart area. Widen the axis padding if needed.
3. **P&L breakdown has stray underlines.** There are short lines under the "Closed trades" and "Open positions" rows.
    - Use a single grid for the statement (label | gross | charges | result), with one 1 px divider between rows and a stronger rule above "Total P&L".
    - Remove the leftover borders. Columns are left-aligned for the label and right-aligned for the amounts.
4. **The "Bought below stop" badge** sits on its own line under the symbol, making the MPHASIS row taller than the others.
    - Put it on the same line as the symbol, as a compact amber chip ("Below stop"), with the full text in a tooltip.
    - The strategy and status chips stay on line two.
5. **Charges card on Charts** (the donut by Taxes, Brokerage, Exchange & SEBI, DP):
    - When there are no itemised charges yet, it must show "Charges will split by type after the next fill." with the total, and not an empty card.
    - Check it after migration 006 too: only non-zero groups, the total in the centre, and a legend with ₹ and %.
6. **Hide zero-noise everywhere:**
    - Win rate "0.0%" with 0 wins: show it as "0%".
    - "Avg win" with no wins: show "—".
    - Profit factor with no wins: show "—", not "0.00".
    - Avg days held "0.0": show "Same day" when every trade was intraday.
    - Add tests for these formatting helpers.
7. **Header bell badge** overlaps the icon edge. Nudge it to `top: -4px; right: -4px`, with a 2 px ring in the page background colour.
8. **Number rhythm:** every big number on cards and in the hero uses the same size scale (32/24/16 px) and `font-variant-numeric: tabular-nums`. Card sublines are 12 px muted, at most two lines, with no mid-word wrapping (`overflow-wrap: anywhere` is off).

**Done means:** paste the test, lint and build output and the diff. Attach screenshots of Reports → Trades, Reports → P&L and Charts at 1440 px and 390 px.
