You are working in `C:\Projects\mcube` on Mansel Live. Apply the approved v2.1 look ("Ink and saffron"), the new sidebar, the new Today and Swing card layouts, move Reports and Charts out of Audit into their own pages, and make every book filter really filter. Do not touch anything under `engine/`.

**Source of truth:** the design canvas https://claude.ai/artifact/XZN7wDwKuKrX2VfqntUXuB, artboards `Main.dc.html` (Today), `Swing.dc.html`, `Reports.dc.html`, `Audit.dc.html`. Where this prompt and an artboard disagree on looks, the artboard wins. Numbers on the artboards are a snapshot; every number in the app comes from the database through `lib/mlive/pnl.ts`.

Keep `npm run lint`, `npm run build`, `npm run engine:build` and `npm run engine:test` green.

## 1. Tokens (`app/(mlive)/mlive.css`, `app/(mlive)/layout.tsx`)
Replace the token values; keep the variable names so existing rules keep working.

| Token | Value |
| --- | --- |
| `--bg` | `#F5F4F1` |
| `--surface` | `#FFFFFF` |
| `--surface2` (chips, segmented ground) | `#EFEDE8` |
| `--line`, `--line2` | `#E6E3DD` |
| `--row-line` | `#F0EEE9` |
| `--ink` | `#1B1A21` |
| `--ink2`, `--ink3`, `--neutral` | `#676470` |
| `--brand` | `#C8430D` |
| `--brand-soft` | `#FCEBDD` |
| `--up`, `--profit` / `--profit-bg` | `#0F7A55` / `#DFF2E9` |
| `--down`, `--loss` / `--loss-bg` | `#B92D1E` / `#FBE6E2` |
| `--warn` / new `--warn-bg` | `#9A5B00` / `#FAEFD4` |
| `--swing`, `--rs`, `--open` / `--open-bg` | `#4050C4` / `#E6E9FA` |
| `--intraday` / new `--intraday-bg` | `#0B7472` / `#DBF0EF` |
| new `--rail-bg`, `--rail-ink`, `--rail-muted`, `--rail-line`, `--rail-active`, `--rail-card` | `#1B1A21`, `#F3F1EC`, `#A7A3B1`, `#34323D`, `#2E2B37`, `#25232D` |

- Display font: replace Space Grotesk with **Plus Jakarta Sans** 600/700 (`next/font/google`, same `--font-mlive-display` variable). Body stays Inter. Tabular numbers everywhere.
- Cards: 16 px radius, 1 px `--line` border, no shadow, padding 22×24. Chips become pills (999 px radius). Text contrast at least 4.5:1; touch targets at least 44 px.
- Brand colour is for the logo, links and the one primary button per page. It is not used for the active nav item any more.

## 2. Sidebar (`components/mlive/frame.tsx`)
- Dark rail, 232 px wide, `--rail-bg`. Top: logo mark and the name "Mansel Live".
- Three labelled groups (11 px uppercase labels in `--rail-muted`):
  - **Trade:** Today, Swing, Intraday
  - **Results:** Reports, Charts
  - **Review:** Research, Audit
- Item: icon + label in a row, 44 px tall, 10 px radius. Active item: `--rail-active` background, white text. Others `--rail-muted`.
- Pinned to the bottom: a status card (`--rail-card`) with a green dot and "Running on Auto" (or "Paused", "Approval"), the Kite line ("Kite connected 09:57" or "Kite not connected" in warn), and a "Pause engine" / "Resume engine" button that calls the existing `/api/mlive/state`. Under it, the Settings item.
- Below 1100 px the rail collapses to a 72 px icon rail with tooltips. On a phone the bottom bar is Today, Swing, Intraday, Reports, More (Audit, Research, Settings). Charts is not offered on a phone: leave it out of the phone navigation, and if `/live-trade-mansel/charts` is opened below 768 px show a short note with a link to Reports instead of the charts. Do not build a phone layout for Charts.

## 3. Today (`home-view.tsx`), as `Main.dc.html`
- **Hero card** replaces the account card and the separate "Free to invest" and "Breaker" cards: account value (44 px), today's change as a pill with %, the swing/intraday split bar with amounts; a small account-value line since the first trade with a dashed "put in" line; and four compact figures: Free to invest, Open positions, This month, Breaker (value plus a thin meter).
- **Two book cards** with a 3 px top edge in the book colour, an "Open" link to the book page, today's P&L (32 px), one line of context, and three figures (Swing: Open positions, This month, Buys today n of max. Intraday: Trades today, This month, Day loss limit used).
- **Holdings** table with a "Room above stop" column drawn as a thin bar plus the %, and a "n of n stops in Kite" pill in the card header (loss-coloured if any stop is missing).
- **Activity** list as date · pill · stock · detail, with All / Orders / Skipped.

## 4. Swing (`swing-view.tsx`), as `Swing.dc.html`
- The four tiles become one card: a divided strip (Today, Open positions, This month, Free to invest) with the swing top edge.
- Positions table as Holdings above.
- Today's ideas: outcome pill per idea. An idea for a stock already in the book reads "Already in the book" with a "Held" pill, not "Logged. The engine has not decided yet" under "Skipped". Header shows "n ideas · n bought".
- Strategies as cards: name, status pill (On / Retiring / Off), profit factor, per-trade return and trade count from `mlive_research` when present, otherwise an em dash; one line of note.
- Closed trades: the latest five, with a link "All trades in Reports".

## 5. Reports and Charts as their own pages
- `/live-trade-mansel/reports` is **Reports** with two tabs, **P&L** and **Trades**, in the URL (`?tab=pnl|trades`). `/live-trade-mansel/charts` is **Charts**. Both already exist as routes; restyle them and remove P&L, Charts and Trades from Audit. Redirect `/audit?tab=pnl|trades|charts` to the new places.
- Reports header, right side, shared by both tabs and kept in the URL: search by stock, result All / Won / Lost, book All / Swing / Intraday, CSV.
- **P&L tab**, top to bottom as `Reports.dc.html`: four cards (Total P&L, Realised, Unrealised, Charges paid) with a coloured top edge and the existing info buttons; a one-card strip (Account value, Win rate, Profit factor, Avg win / avg loss, Free to invest); a compact Open positions table and Closed trades table (latest ten, "See all" goes to the Trades tab). Below them keep the existing v1 blocks unchanged in content: P&L breakdown with charges detail, Statement, Capital statement, By strategy.
- **Trades tab:** the existing v1 Trades tables, filters and side panel, restyled. Rows keep the coloured left edge (open, profit, loss).
- **Charts:** same content as today with the new tokens; add the book switch.

## 6. Book filter must really filter (the current bug)
Today, choosing Intraday still shows swing. Fix all of it:
- `pnlPayload(range, strategy, book)` in `lib/mlive/pnl-load.ts` filters positions only. Also filter fills, charge items, decisions and GTT rows to the chosen book's positions, and use the book's own capital: swing uses the fund ledger and `mlive_equity_daily`; intraday uses `intraday_capital_inr` and its own realised P&L; All is the sum. Capital deposited, the capital statement, account value and the strategy list must all belong to the chosen book (intraday lists ORB and VWAP, not RS and EMA).
- `charts-view.tsx` never sends `book`; send it, and make `/api/mlive/charts` and anything it reads honour it.
- `/api/mlive/reports/ledger`, `/api/mlive/reports/audit` and the CSV route accept `book` and filter by the `book` column on decisions, orders and positions.
- When a book has no trades, show an empty state ("No intraday trades yet. The book starts after a strategy passes the bar.") instead of a page of zeros.
- Changing any filter updates the URL with `router.replace`, and the data refetches from the URL, so refresh, back and shared links keep the view.
- Add vitest tests for the pure P&L model: with one swing and one intraday position, each book returns only its own trades, charges and capital, and All equals their sum.

## 7. Audit (`audit-view.tsx`), as `Audit.dc.html`
- Three views as a segmented control, in the URL (`?view=log|daily|system`): **Log** (default), **Daily report**, **System**.
- **Log** filter row, all kept in the URL and all applied server-side in `/api/mlive/reports/audit`: search (stock or text in the detail), date range, who (Everyone / Engine / You), book, and type pills: All, Bought, Sold, Skipped, Stops, Alerts, Settings changes. Alerts shows the existing alerts list with Mark seen and Mark all as read.
- Rows grouped under one heading per day: time, who, action pill, stock, detail. "Rows are never edited or deleted." under the list, with the pager.
- Right column on desktop: the selected day's summary (Net today, Bought, Sold, Skipped), the rules check (Swing buys, Holdings with a stop, Breaker, Intraday loss limit, Intraday closed by the close-by time, read from the `intraday_exit_time` setting, now 15:00), and a short System card (today's remaining jobs with status, "All jobs" opens the System view). Clicking a day heading selects that day.
- Daily report and System views keep their current content with the new tokens.

## 8. Checks
- Restyle Intraday, Research and Settings with the same tokens and card style; no layout change there.
- Every page handles loading, empty, Kite not logged in, market closed and paused.
- At 1440 px and 390 px, compare each page with its artboard and list anything that still differs and why (Charts at 1440 px only).
