You are working in `C:\Projects\mcube` on Mansel Live. This is a follow-up polish pass on Reports and Charts. Check each change in the browser at `http://localhost:3000/live-trade-mansel/reports` (P&L and Trades tabs) and `/charts`, at 1440 px and 390 px wide. Keep `npm run engine:test`, `npm run lint` and `npm run build` green.

## 1. Bug: open-position charges are left out of P&L
**What happens now:**
- ZYDUSLIFE shows gross +₹97.60, charges ₹22.98 and **net +₹97.60**.
- "Total P&L" is +₹87.31.
- But the account is ₹80,064, which is only **+₹64** on ₹80,000.

The buy charges on an open position are already paid; they're out of the trading limit. So they must count.

**Fix in `lib/mlive/pnl.ts`:**
- For an open position: **net = unrealised gross − buy charges paid**, and net % is calculated from that.
- `summary.unrealised` stays gross (the price move). Add `summary.openCharges` and `summary.openNet`.
- **Total P&L = realised net + open net.** It must equal account value − net capital, to the paisa.
- Update the cards. Unrealised shows the gross with a subline "after ₹22.98 buy charges: +₹74.62". Total P&L, and the hero chip on Charts, use the new total.

**Tests:**
- An open position's net = gross − buy charges.
- Total P&L = account value − deposits + withdrawals, for a fixture with one closed and one open position.

## 2. Trades table: add the amount invested, and fix the layout
- **New column "Invested"** after Qty · days:
    - Open positions: qty × average entry, e.g. `₹19,262.40`.
    - Closed trades: the entry value, the same formula at entry.
    - Put the exit value under it, muted: "out ₹17,113.60".
    - The section totals row sums Invested.
- **Section titles centred.** "Open positions (1)" and "Closed trades (1)" sit centred above their table, 16 px semibold, with the count badge after the text.
- **Both tables share one column grid.** Use one `<colgroup>` with fixed widths and `table-layout: fixed`, so columns line up exactly between Open and Closed.
    - Suggested widths: Stock 18%, Entry → Exit 20%, Qty · days 9%, Invested 11%, Stop 11%, Gross 8%, Charges 8%, Net 10%, R 5%.
- **No wrapping inside cells:**
    - Headers stay on one line (`white-space: nowrap`).
    - Entry → Exit is two stacked lines: `9 Nov · ₹2,438.50` and `→ 9 Nov · ₹2,444.80`. It never breaks mid-value.
    - Net is one line: `−₹10.29`. Today the "−" sits on its own line above the number; keep the sign and number together with `white-space: nowrap`.
- **Sort arrows:** show ▲ or ▼ only on the column being sorted. Other headers show a faint ↕ on hover only.
- **Stop column:**
    - Show `₹1,175.40`, with the GTT dot and the text "GTT ₹1,140.10" under it, from `mlive_gtts.trigger_price`.
    - Remove the duplicate "now ₹1,175.40" when it equals the initial stop. Show "now ₹X" only when the stop has moved.
    - Replace the stray green bar after the value with a proper 8 px round dot and a "GTT active" or "GTT missing" tooltip.
- **Badges:** "Bought below stop" (amber) goes on the same line as the symbol. Strategy and status chips go on the second line. The row height stays steady.
- **Filter bar:**
    - One row: search on the left, then the three chip groups with a 1 px divider between groups. The CSV button sits at the far right of the same row.
    - On mobile it wraps into two rows, with CSV on the right of the first row.

## 3. Reports → P&L tab polish
- **Cards:** text is left-aligned (label, number, subline). Today they're right-aligned or centred.
- **The P&L breakdown bar** is empty and grey. Draw the segments: realised gross (green or red), charges (amber), open net (blue). Segment widths are proportional to their absolute values, with a 2 px gap between them and a legend under the bar.
- **The breakdown statement:** the columns line up as a grid (label | gross | charges | result). Today the values float.

## 4. Charts polish
- **Stat cards** are left-aligned, like Reports. The drawdown card shows `0.0%` big and "of 25% breaker" as the subline, not wrapped onto two lines of big text.
- **Trade results:** the x-axis domain must include 0. Today it runs from −₹13 to −₹9, so a −₹10 trade looks huge.
    - Bars start at 0 and are capped at 28 px thick.
    - The label shows the value at the end of the bar.
- **By period:** the domain includes 0 and is padded by 20%. Ticks are round values (e.g. −₹5 steps). Bars are at most 40 px wide.
- **Strategy face-off:**
    - Stats sit in a two-column label/value grid, with labels muted and values right-aligned.
    - The empty side keeps the same height, with "No trades yet" vertically centred.
- **Open positions now:**
    - Label the bar ends and markers: stop ₹1,175.40 on the left, entry ₹1,203.90 as a marker, now ₹1,210.00 on the right.
    - Show the net after charges (from fix 1), and "GTT ₹1,140.10".

## Done means
- Paste the test, lint and build output and the diff.
- Attach screenshots of Reports → Trades, Reports → P&L and Charts at 1440 px and 390 px.
- The screenshots must show:
    - the Invested column;
    - centred section titles;
    - aligned columns across both tables;
    - no wrapped sign or header;
    - Total P&L equal to account value minus capital.
