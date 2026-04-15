# Feature Spec: Loan Repayment Tracker

## Overview

Add a new **"Repayments"** tab to the existing Next.js app. This is a flexible, personal loan repayment tracker — NOT a rigid plan. The user has multiple creditors they're repaying for a property purchase. They want to log payments freely (any amount, to anyone, anytime) and see visual progress of how much is left.

## Tech Stack (existing app)

- **Next.js** (App Router)
- **Tailwind CSS** + **shadcn/ui** components
- **MongoDB** (use Mongoose for models)
- Use existing DB connection from the app. If there's a `lib/db.ts` or `lib/mongoose.ts`, reuse it.

## Data Model

### `Creditor` (MongoDB collection: `creditors`)

```ts
{
  _id: ObjectId,
  name: string,              // "Mom", "Anantha", "Bank Loan", "Friends", etc.
  type: "family" | "bank" | "friends" | "personal",
  originalAmount: number,     // total borrowed (e.g. 7000000 for Mom)
  interestRate: number,       // annual % (0 for interest-free, 8.5 for bank)
  notes: string,              // optional — "flexible repayment", "clear in 8 months", etc.
  color: string,              // hex color for charts — auto-assign from a palette, user can change
  isActive: boolean,          // soft delete / mark as fully paid
  createdAt: Date,
  updatedAt: Date,
}
```

### `Payment` (MongoDB collection: `payments`)

```ts
{
  _id: ObjectId,
  creditorId: ObjectId,       // ref to Creditor
  amount: number,             // amount paid
  date: Date,                 // when the payment was made (user picks, defaults to today)
  method: "bank_transfer" | "cash" | "upi" | "cheque" | "auto_emi" | "other",
  notes: string,              // optional — "from salary", "bonus month", etc.
  createdAt: Date,
}
```

No `totalPaid` or `balance` fields on Creditor — always compute these dynamically by summing payments. This keeps data clean and avoids sync issues.

## Pages & Routes

### `/repayments` — Main Dashboard

This is the primary view. Everything lives on one page with sections stacked vertically.

#### Section 1: Summary Cards (top row)

A row of compact stat cards:

| Card | Value | Subtitle |
|------|-------|----------|
| Total Borrowed | ₹1.35 Cr | Sum of all creditor originalAmounts |
| Total Repaid | ₹X | Sum of all payments |
| Remaining | ₹Y | Borrowed minus repaid |
| Progress | X% | Circular progress ring or bar |

Format all amounts in Indian numbering (lakhs/crores). Use `Intl.NumberFormat('en-IN')`.

#### Section 2: Creditor Breakdown

A set of **cards** (not a table), one per creditor. Each card shows:

- **Name** + colored dot (matches chart color)
- **Type badge** (family / bank / friends / personal) — subtle, muted colors
- **Progress bar** showing % repaid — use the creditor's assigned color
- **Originally borrowed** → **Paid so far** → **Remaining** in a compact row
- If `interestRate > 0`, show a small note: "@ 8.5% p.a."
- **Quick pay button** — opens the "Log Payment" sheet/modal pre-filled with this creditor
- Clicking the card expands or navigates to show that creditor's payment history

Sort creditors: active ones first (by remaining balance descending), then fully paid ones at the bottom (greyed out, collapsed).

#### Section 3: Charts

Two charts side by side on desktop, stacked on mobile:

**Chart A — Repayment Progress (Stacked Bar or Donut)**
- Shows each creditor as a segment
- Two states: "Paid" (solid color) vs "Remaining" (faded/lighter shade of same color)
- Use `recharts` (already commonly available with shadcn setups). If not installed, add it.

**Chart B — Monthly Payment History (Bar Chart)**
- X-axis: months (last 12 months, or since first payment)
- Y-axis: total amount paid that month
- Each bar is stacked by creditor (using their colors)
- Gives a visual of "how much am I paying per month" over time

#### Section 4: Recent Payments (Activity Feed)

A compact list of the last 10-15 payments, most recent first:
- Date | Creditor name (with colored dot) | Amount | Method badge | Notes
- "View all" link goes to full payment history

### Log Payment — Sheet/Dialog

Triggered by:
- The floating **"+ Log Payment"** button (always visible, bottom-right on mobile, top-right on desktop)
- The "Quick pay" button on a creditor card

**Form fields:**

| Field | Type | Notes |
|-------|------|-------|
| Creditor | Select dropdown | List of active creditors |
| Amount (₹) | Number input | No decimals needed. Support pasting "100000" or "1,00,000" |
| Date | Date picker | Defaults to today. Allow past dates for backdating |
| Method | Select | bank_transfer, upi, cash, cheque, auto_emi, other |
| Notes | Text input (optional) | Short note, e.g. "March salary" |

On submit: save to `payments` collection, show a success toast, and update the dashboard in place (no full page reload — use `mutate` / `revalidate`).

### Manage Creditors — Sheet/Dialog

Accessible from a **"Manage Creditors"** button/link on the dashboard (near the summary section, not too prominent).

- **Add creditor**: name, type, original amount, interest rate (default 0), notes, color
- **Edit creditor**: all fields editable
- **Mark as paid / Reactivate**: toggle `isActive`
- **Delete**: only if zero payments logged against it. Otherwise show "can't delete, has payments"

### Full Payment History — `/repayments/history`

A paginated, filterable table/list of ALL payments:
- Filter by: creditor (multi-select), date range, method
- Sort by: date (default desc), amount
- Each row: date, creditor, amount, method, notes
- Allow **edit** (amount, date, notes, method) and **delete** (with confirmation) on each payment
- Show totals at the bottom for the filtered view

## API Routes

Use Next.js Route Handlers (App Router):

```
GET    /api/repayments/creditors          — list all creditors with computed balances
POST   /api/repayments/creditors          — create creditor
PUT    /api/repayments/creditors/[id]     — update creditor
DELETE /api/repayments/creditors/[id]     — delete creditor (only if no payments)

GET    /api/repayments/payments           — list payments (with filters: creditorId, startDate, endDate, method)
POST   /api/repayments/payments           — log a payment
PUT    /api/repayments/payments/[id]      — edit a payment
DELETE /api/repayments/payments/[id]      — delete a payment

GET    /api/repayments/stats              — aggregated stats (total borrowed, paid, remaining, monthly breakdown)
```

The `GET /creditors` endpoint should return each creditor with `totalPaid` and `remaining` computed via MongoDB aggregation pipeline (sum payments grouped by creditorId), not stored fields.

The `GET /stats` endpoint should return:
- `totalBorrowed`, `totalPaid`, `totalRemaining`, `progressPercent`
- `monthlyBreakdown`: array of `{ month: "2026-04", total: 325000, byCreditor: { "Mom": 100000, ... } }` for charting
- `creditorSummary`: array of `{ name, originalAmount, totalPaid, remaining, color }` for the donut chart

## UI/UX Guidelines

- **Indian number formatting everywhere.** ₹70,00,000 not ₹7,000,000. Use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`.
- **Mobile-first.** This will mostly be used on phone to quickly log a payment. The "Log Payment" action must be reachable in one tap.
- **Use shadcn/ui components**: `Card`, `Button`, `Dialog` or `Sheet` (Sheet is better for mobile), `Select`, `Input`, `Badge`, `Table`, `Progress`, `Calendar`/`DatePicker`, `Popover`, `DropdownMenu`, `Toast` (via `sonner` or shadcn toast).
- **Colors**: assign each creditor a distinct color from a predefined palette. Suggested palette: `["#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"]`. Store chosen color on the creditor doc.
- **Charts**: use `recharts`. Install if not present: `npm install recharts`.
- Keep the page **fast**. Use `useSWR` or React Query for data fetching with proper cache invalidation after mutations. If the app already uses one of these, use the same.
- **No login/auth needed** for this feature — assume single-user app.

## Seed Data

On first load, if zero creditors exist, show an **empty state** with a friendly message and a "Set up your creditors" button. Do NOT auto-seed data.

However, provide a **one-click seed** option (behind a small "Load sample data" link in the empty state) that creates:

| Name | Type | Original Amount | Rate | Notes |
|------|------|----------------|------|-------|
| Mom | family | 70,00,000 | 0% | Flexible repayment, as and when possible |
| Anantha | family | 10,00,000 | 0% | Needs full repayment in 8-10 months |
| Bank Loan | bank | 30,00,000 | 8.5% | 5-year tenure, EMI ~61,550/month |
| Friends | friends | 14,00,000 | 0% | Steady monthly repayment |
| Credit Card | personal | 1,00,000 | 0% | Clear immediately |

## File Structure (suggested)

```
app/
  repayments/
    page.tsx                    — main dashboard
    history/
      page.tsx                  — full payment history
    components/
      summary-cards.tsx         — top stat cards
      creditor-card.tsx         — individual creditor card with progress
      creditor-list.tsx         — list of creditor cards
      payment-form.tsx          — log payment sheet/dialog
      creditor-form.tsx         — add/edit creditor sheet/dialog
      creditor-manager.tsx      — manage creditors UI
      progress-charts.tsx       — recharts donut + bar charts
      recent-payments.tsx       — activity feed
      payment-history-table.tsx — full history table with filters
    lib/
      format.ts                 — Indian currency formatting, date formatting helpers
      hooks.ts                  — useSWR hooks for creditors, payments, stats
      seed.ts                   — seed data function

lib/
  models/
    creditor.ts                 — Mongoose model
    payment.ts                  — Mongoose model

app/api/repayments/
  creditors/
    route.ts                    — GET, POST
    [id]/
      route.ts                  — PUT, DELETE
  payments/
    route.ts                    — GET, POST
    [id]/
      route.ts                  — PUT, DELETE
  stats/
    route.ts                    — GET
```

## What NOT to Build

- No rigid "repayment plan" or schedule. The user decides freely each month.
- No EMI calculator or projections. This is a tracker, not a planner.
- No authentication or multi-user support.
- No recurring payment automation. Every payment is manually logged.
- No notifications or reminders.

## Definition of Done

1. User can add/edit/remove creditors with name, type, amount, rate, color
2. User can log payments to any creditor with amount, date, method, notes
3. User can edit and delete past payments
4. Dashboard shows live summary stats, per-creditor progress, charts, and recent activity
5. Charts update in real-time as payments are logged
6. All amounts display in Indian numbering format (lakhs/crores)
7. Works well on mobile — log payment in one tap
8. Full payment history with filtering and sorting
9. Empty state with optional sample data seeding
