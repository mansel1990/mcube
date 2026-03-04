# MCube Back Office — Implementation Plan

> **Status**: Planning complete. Ready to implement.
> **Written**: 2026-03-04
> **Stack**: Next.js 16 (App Router) · Better Auth · MongoDB (Mongoose) · PWA Web Push

---

## Overview

This document is a self-contained implementation guide for adding a back office to the MCube marketing site (`c:\Projects\mcube`). The back office has two completely independent tools accessed by different people:

| Section | Route | Users | Purpose |
|---|---|---|---|
| **Stocks** | `/stocks/*` | 2 designated users | Office budget tracking |
| **Admin** | `/admin/*` | 1 admin user | Plans, tasks, notifications |

The two sections are **siloed** — stocks users cannot access admin and vice versa. Each section has its own login page. There is no shared dashboard.

---

## Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Auth | **Better Auth v1.4.18** | Same version already used in `c:\Projects\cricket-app` — proven pattern |
| Database | **MongoDB** (existing cluster) | Reuse same Atlas cluster; create new `mcube` database |
| ODM | **Mongoose v9** | Same as cricket-app; singleton connection pattern |
| Notifications | **PWA Web Push API** | Free, native, no external service; works on mobile when installed as PWA |
| Deployment | **Vercel Pro** | Already set up |

---

## MongoDB Setup

### Connection URI
Change the database name from `ancients_cricketclub` → `mcube` in the URI:

```
MONGODB_URI=mongodb+srv://Vercel-Admin-mansel-db:mansel59@mansel-db.5l3ydxy.mongodb.net/mcube?retryWrites=true&w=majority
```

Add this to `.env.local` in the mcube project. Also add it to the Vercel environment variables dashboard before deploying.

### Collections Created
- `users` — managed by Better Auth (with custom `section` field added)
- `sessions` — managed by Better Auth
- `accounts` — managed by Better Auth
- `verifications` — managed by Better Auth
- `budget_entries` — custom (Mongoose)
- `plans` — custom (Mongoose)
- `notifications` — custom (Mongoose)
- `push_subscriptions` — custom (Mongoose) for PWA Web Push

---

## Project Structure

```
c:\Projects\mcube/
├── app/
│   ├── (public)/                          # Marketing site route group
│   │   ├── layout.tsx                     # Public layout (existing Navbar + Footer)
│   │   └── page.tsx                       # Existing home page
│   │
│   ├── (stocks)/                          # Stocks tool route group
│   │   ├── layout.tsx                     # Stocks shell layout (sidebar, no public nav)
│   │   └── stocks/
│   │       ├── page.tsx                   # Budget overview (monthly table + summary)
│   │       ├── new/page.tsx               # Add budget entry form
│   │       └── [id]/page.tsx              # Edit/view single budget entry
│   │
│   ├── (admin)/                           # Admin tool route group
│   │   ├── layout.tsx                     # Admin shell layout (sidebar + notification bell)
│   │   └── admin/
│   │       ├── page.tsx                   # Admin dashboard (plan stats)
│   │       ├── plans/
│   │       │   ├── page.tsx               # Plans list
│   │       │   ├── new/page.tsx           # Create plan
│   │       │   └── [id]/page.tsx          # Edit/view plan
│   │       └── settings/
│   │           └── page.tsx               # User management (create stocks/admin accounts)
│   │
│   ├── auth/
│   │   ├── stocks-login/page.tsx          # Login page for stocks users
│   │   └── admin-login/page.tsx           # Login page for admin users
│   │
│   └── api/
│       ├── auth/[...all]/route.ts         # Better Auth catch-all handler
│       ├── budget/
│       │   ├── route.ts                   # GET list, POST create
│       │   └── [id]/route.ts              # GET, PUT, DELETE
│       ├── plans/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── notifications/
│       │   ├── route.ts                   # GET unread, PATCH mark-read
│       │   └── push-subscription/route.ts # POST save, DELETE remove PWA subscription
│       └── cron/
│           └── reminders/route.ts         # Vercel Cron — triggers push notifications
│
├── components/
│   ├── ui/                                # Existing marketing UI (move from app/components/ui/)
│   ├── layout/                            # Existing Navbar/Footer (move from app/components/layout/)
│   ├── stocks/                            # Budget module components
│   │   ├── BudgetTable.tsx
│   │   ├── BudgetSummaryCard.tsx
│   │   └── BudgetEntryForm.tsx
│   └── admin/                             # Admin module components
│       ├── Sidebar.tsx
│       ├── NotificationBell.tsx
│       ├── plans/
│       │   ├── PlanList.tsx
│       │   ├── PlanCard.tsx
│       │   └── PlanForm.tsx
│       └── settings/
│           └── UserForm.tsx
│
├── lib/
│   ├── mongodb.ts                         # Singleton Mongoose connection (copy from cricket-app)
│   ├── auth.ts                            # Better Auth server config (adapted from cricket-app)
│   └── auth-client.ts                     # Better Auth browser client
│
├── models/
│   ├── User.ts                            # Better Auth user + custom fields
│   ├── BudgetEntry.ts
│   ├── Plan.ts
│   ├── Notification.ts
│   └── PushSubscription.ts
│
├── middleware.ts                           # Route protection (project root)
├── public/
│   └── sw.js                              # PWA Service Worker (push notification handler)
├── vercel.json                            # Cron job schedule
└── .env.local                             # Environment variables
```

---

## Auth Configuration

### Copy from cricket-app (adapt, don't rewrite)

**`lib/mongodb.ts`** — Copy the singleton connection pattern exactly from `c:\Projects\cricket-app\lib\mongodb.ts`. Only change: it imports from local `process.env.MONGODB_URI` (no other changes needed).

**`lib/auth.ts`** — Adapted from cricket-app, but remove Google OAuth, keep only credentials (email + password):

```typescript
// lib/auth.ts — conceptual shape
import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { MongoClient } from 'mongodb'

let clientPromise: Promise<MongoClient> | null = null

function getMongoClient() {
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI!)
    clientPromise = client.connect()
  }
  return clientPromise
}

export const auth = betterAuth({
  database: mongodbAdapter(getMongoClient()),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,           // Don't auto sign-in after password change
  },
  user: {
    additionalFields: {
      section: {
        type: 'string',          // 'stocks' | 'admin'
        required: true,
        defaultValue: 'stocks',
      }
    }
  }
})
```

**`lib/auth-client.ts`** — Same as cricket-app, just `createAuthClient({ baseURL: process.env.NEXT_PUBLIC_APP_URL })`.

### User Seeding
Create a one-time seed script (`scripts/seed-users.ts`) to create the initial accounts:
- 1 admin user (`section: 'admin'`)
- 2 stocks users (`section: 'stocks'`)

Run with: `npx tsx scripts/seed-users.ts`

---

## Middleware

**`middleware.ts`** at project root — this is the security boundary:

```typescript
// Pseudocode — conceptual design
// Matcher: ['/stocks/:path*', '/admin/:path*']

// For /stocks/* requests:
//   - No session → redirect to /auth/stocks-login
//   - Session exists but section !== 'stocks' → redirect to /auth/stocks-login
//   - Session + section === 'stocks' → allow through

// For /admin/* requests:
//   - No session → redirect to /auth/admin-login
//   - Session exists but section !== 'admin' → redirect to /auth/admin-login
//   - Session + section === 'admin' → allow through

// All other routes: pass through untouched
```

The `callbackUrl` query param is appended to each login redirect so users return to their intended page after logging in.

---

## Data Models

### `models/BudgetEntry.ts`

```typescript
interface IBudgetEntry {
  type: 'income' | 'expense'
  category: string          // e.g. "Software", "Hardware", "Salary", "Office"
  description: string
  amount: number            // stored as number (e.g. 150.00)
  currency: string          // default: 'USD'
  date: Date                // transaction date
  month: number             // 1-12, denormalized for fast monthly queries
  year: number              // e.g. 2026, denormalized
  notes?: string
  isRecurring: boolean      // default: false
  createdBy: string         // Better Auth user ID
  createdAt: Date
  updatedAt: Date
}
```

### `models/Plan.ts`

```typescript
interface IPlan {
  title: string
  description?: string
  status: 'todo' | 'in_progress' | 'done' | 'cancelled'  // default: 'todo'
  priority: 'low' | 'medium' | 'high' | 'critical'       // default: 'medium'
  dueDate?: Date
  reminderAt?: Date         // when set, cron job sends push notification
  reminderSent: boolean     // default: false — prevents duplicate notifications
  createdBy: string         // Better Auth user ID
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}
```

### `models/Notification.ts`

```typescript
interface INotification {
  userId: string            // Better Auth user ID (recipient)
  type: 'plan_reminder' | 'plan_due' | 'system'
  title: string
  body: string
  entityType?: 'plan'
  entityId?: string         // MongoDB ObjectId as string
  isRead: boolean           // default: false
  readAt?: Date
  createdAt: Date
}
```

### `models/PushSubscription.ts`

```typescript
interface IPushSubscription {
  userId: string            // Better Auth user ID
  endpoint: string          // Browser push endpoint URL
  keys: {
    p256dh: string          // Public key
    auth: string            // Auth secret
  }
  userAgent?: string        // Optional: to identify device
  createdAt: Date
}
```

All models use the cricket-app pattern:
```typescript
const Model = mongoose.models.ModelName || mongoose.model<IModel>('ModelName', schema)
export default Model
```

---

## PWA Push Notifications

### How it works (zero external services, completely free)

1. **VAPID keys** — generated once, stored in `.env.local`:
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<generated>
   VAPID_PRIVATE_KEY=<generated>
   VAPID_EMAIL=hello@mcube.studio
   ```
   Generate with: `npx web-push generate-vapid-keys`

2. **Service Worker** (`public/sw.js`) — handles incoming push events from the browser:
   ```javascript
   // Listens for push events and shows OS-level notifications
   self.addEventListener('push', (event) => {
     const data = event.data.json()
     self.registration.showNotification(data.title, {
       body: data.body,
       icon: '/logo.png',
       badge: '/logo.png',
       data: { url: data.url }
     })
   })
   self.addEventListener('notificationclick', (event) => {
     event.notification.close()
     clients.openWindow(event.notification.data.url)
   })
   ```

3. **Subscribe flow** — when admin logs in to `/admin/*`, the browser prompts for notification permission. If granted, the push subscription object is sent to `POST /api/notifications/push-subscription` and saved in MongoDB.

4. **Send push** — the `app/api/cron/reminders/route.ts` Vercel Cron handler:
   - Runs every minute (configured in `vercel.json`)
   - Queries plans where `reminderAt <= now AND reminderSent = false`
   - For each matching plan: creates a `Notification` document, fetches all `PushSubscription` docs for the user, sends push via `web-push` package
   - Sets `reminderSent = true` on the plan

5. **Install required package**:
   ```bash
   npm install web-push
   npm install -D @types/web-push
   ```

6. **Works on mobile when PWA is installed** on both iOS 16.4+ and Android Chrome.

### Vercel Cron Configuration (`vercel.json`)
```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "* * * * *"
    }
  ]
}
```
The cron route should validate a `CRON_SECRET` header to prevent unauthorized calls:
```
CRON_SECRET=<random-string>
```
Vercel automatically passes `Authorization: Bearer <CRON_SECRET>` to cron routes.

---

## Stocks Module — Budget Tracker

### Features
- Add income and expense entries with category, amount, date, description
- Monthly filter (switch between months/years)
- Summary card: total income, total expenses, net balance for selected period
- Mark entries as recurring
- Edit and delete entries
- All 3 users (the 2 stocks users) have full CRUD access

### Suggested Categories (hardcoded list to start)
```typescript
const EXPENSE_CATEGORIES = ['Software', 'Hardware', 'Office Supplies', 'Travel', 'Marketing', 'Utilities', 'Salary', 'Other']
const INCOME_CATEGORIES = ['Client Payment', 'Retainer', 'Project', 'Other']
```

### API Routes
- `GET /api/budget?month=3&year=2026` — list entries for a month
- `POST /api/budget` — create entry (body: all IBudgetEntry fields except audit fields)
- `GET /api/budget/[id]` — single entry
- `PUT /api/budget/[id]` — update entry
- `DELETE /api/budget/[id]` — delete entry

All routes check session and verify `user.section === 'stocks'`.

---

## Admin Module — Plans & Notifications

### Features
- Create plans with title, description, priority, due date, and optional reminder
- View plans filtered by status (kanban-style or list)
- Mark plans as done/cancelled
- Notification bell in the topbar — shows unread count, click to see list
- Push notification on mobile when a reminder fires

### Notification Bell Behavior
- Client component that polls `GET /api/notifications?unread=true` every 60 seconds and on window focus
- Shows count badge on bell icon when unread > 0
- Clicking opens a dropdown list of recent notifications
- Click on a notification marks it read (`PATCH /api/notifications/[id]`) and navigates to the related plan

### API Routes
- `GET /api/plans?status=todo` — list plans with optional status filter
- `POST /api/plans` — create plan
- `GET /api/plans/[id]` — single plan
- `PUT /api/plans/[id]` — update plan
- `DELETE /api/plans/[id]` — delete plan
- `GET /api/notifications?unread=true` — list notifications
- `PATCH /api/notifications/[id]` — mark as read
- `POST /api/notifications/push-subscription` — save PWA push subscription
- `DELETE /api/notifications/push-subscription` — remove subscription (on logout)

All routes check session and verify `user.section === 'admin'`.

---

## Login Pages

### `/auth/stocks-login`
- Simple card with email + password fields
- Title: "Stocks" (or whatever label fits)
- On success: redirect to `/stocks` (or `callbackUrl` if present)
- No link to admin login (they're separate tools)

### `/auth/admin-login`
- Same layout as stocks login
- Title: "Admin"
- On success: redirect to `/admin`
- On login: registers PWA push subscription if permission granted

Both login pages use the MCube dark theme (`#050505` background, `#2563EB` primary button, glass morphism card).

---

## Implementation Phases

### Phase 1 — Foundation (do this first)
1. Create `docs/backoffice-plan.md` ✅ (this file)
2. Install packages:
   ```bash
   npm install better-auth mongoose web-push
   npm install -D @types/web-push
   ```
3. Add `.env.local` with `MONGODB_URI` (new `mcube` database), `BETTER_AUTH_SECRET`, VAPID keys, `CRON_SECRET`
4. Copy `lib/mongodb.ts` from cricket-app (no changes needed)
5. Create `lib/auth.ts` — credentials only, add `section` custom field (adapt from cricket-app, remove Google OAuth)
6. Create `lib/auth-client.ts` — copy from cricket-app exactly
7. Create `app/api/auth/[...all]/route.ts` — copy from cricket-app exactly
8. Create `middleware.ts` — protect `/stocks/*` and `/admin/*` based on section
9. Create seed script `scripts/seed-users.ts` — create 1 admin + 2 stocks users
10. Create login pages: `/auth/stocks-login/page.tsx` and `/auth/admin-login/page.tsx`
11. Create admin shell: `app/(admin)/layout.tsx` and `app/(admin)/admin/page.tsx`
12. Create stocks shell: `app/(stocks)/layout.tsx` and `app/(stocks)/stocks/page.tsx`

**Test**: Visit `/stocks` → redirect to stocks login. Log in → see stocks dashboard. Visit `/admin` → redirect to admin login.

### Phase 2 — Budget Module
1. Create `models/BudgetEntry.ts`
2. Create API routes: `app/api/budget/route.ts` and `app/api/budget/[id]/route.ts`
3. Create components: `BudgetTable`, `BudgetSummaryCard`, `BudgetEntryForm`
4. Wire up stocks pages: overview, new entry, edit entry

**Test**: Create entries, check monthly totals, edit and delete entries with both stocks user accounts.

### Phase 3 — Plans & Notifications
1. Create `models/Plan.ts`, `models/Notification.ts`, `models/PushSubscription.ts`
2. Create API routes for plans and notifications
3. Create `components/admin/plans/` components
4. Create `components/admin/NotificationBell.tsx`
5. Set up PWA service worker (`public/sw.js`)
6. Add push subscription registration in admin layout (after login)
7. Create cron route `app/api/cron/reminders/route.ts`
8. Add `vercel.json` with cron config

**Test**: Create a plan with `reminderAt = now + 2 minutes`. Wait. Receive push notification on mobile.

### Phase 4 — Polish & Deploy
1. Apply MCube dark theme to all admin/stocks components (reuse `glass-panel`, `glow-box` CSS classes from `app/globals.css`)
2. Add loading skeletons with Tailwind `animate-pulse`
3. Move `app/components/` → top-level `components/` directory
4. Wrap public layout and pages in `(public)` route group
5. Set all environment variables in Vercel dashboard
6. Test session expiry and redirect behavior on production build (`npm run build && npm start`)

---

## Environment Variables

Add to `.env.local` and Vercel dashboard:

```bash
# Database
MONGODB_URI=mongodb+srv://Vercel-Admin-mansel-db:mansel59@mansel-db.5l3ydxy.mongodb.net/mcube?retryWrites=true&w=majority

# Better Auth
BETTER_AUTH_SECRET=<generate: openssl rand -base64 32>
BETTER_AUTH_URL=https://mcube.studio   # or http://localhost:3000 for dev

# PWA Web Push (generate with: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key>
VAPID_EMAIL=hello@mcube.studio

# Vercel Cron security
CRON_SECRET=<generate: openssl rand -base64 32>

# App URL (used by auth-client)
NEXT_PUBLIC_APP_URL=https://mcube.studio  # or http://localhost:3000 for dev
```

---

## Cricket App Patterns to Copy

These files in `c:\Projects\cricket-app` can be copied (with adaptation) to avoid rewriting from scratch:

| File to copy | Target in mcube | Adaptation needed |
|---|---|---|
| `lib/mongodb.ts` | `lib/mongodb.ts` | None — copy exactly |
| `lib/auth.ts` | `lib/auth.ts` | Remove Google OAuth, add `section` custom field |
| `lib/auth-client.ts` | `lib/auth-client.ts` | Update `baseURL` env var if different |
| `app/api/auth/[...all]/route.ts` | Same path | None — copy exactly |
| Any model file | As reference | Use as template for schema pattern |

---

## Notes for Future Claude Context

When implementing, provide this document and say: "Implement the MCube back office per this plan." The AI will have everything needed:
- Full project context (`c:\Projects\mcube`)
- Reference project (`c:\Projects\cricket-app`) with reusable patterns
- MongoDB URI (change only the DB name)
- Complete data models
- Route structure
- Auth setup steps
- Notification approach
