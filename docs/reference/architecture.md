# App Architecture

## Directory Structure
```
app/
├── (admin)/                   # Admin section (route group — no URL segment)
│   ├── layout.tsx             # Auth gate: section === "admin"
│   └── admin/...
├── (stocks)/                  # Stocks section
│   ├── layout.tsx             # Auth gate: section === "stocks" — SINGLE auth check
│   ├── loading.tsx            # Skeleton shown during route transitions (instant click feel)
│   └── stocks/
│       ├── page.tsx           # Manish Logic / suggestions page
│       ├── breakout/          # Breakout strategy
│       ├── ema-pullback/      # EMA Pullback strategy
│       ├── vcp/               # VCP strategy
│       ├── rs-resilience/     # RS Resilience strategy
│       ├── mean-reversion/    # Mean Reversion strategy
│       ├── performance/       # Performance tracking
│       ├── chart/             # Stock chart page
│       └── settings/
├── (loans)/                   # Casa Loans section
├── api/
│   ├── auth/[...all]/         # better-auth handler
│   └── stocks/
│       ├── swing/             # Swing strategy signal routes
│       │   ├── breakout/
│       │   ├── ema-pullback/
│       │   ├── vcp/
│       │   ├── rs-resilience/
│       │   ├── mean-reversion/
│       │   └── performance/
│       ├── notifications/
│       ├── current-price/
│       └── ...
├── auth/                      # Login pages (public)
│   ├── stocks-login/
│   └── admin-login/
└── globals.css                # Light theme: --background #F8FAFC, --foreground #0F172A

components/
├── app-shell.tsx              # Sidebar + top header + mobile bottom nav
└── stocks/
    └── swing/
        ├── signal-card.tsx          # Reusable SwingSignal card
        └── strategy-info-drawer.tsx # Right-side drawer explaining each strategy

lib/
├── auth.ts          # better-auth server instance (MongoDB adapter, 1-year sessions)
├── auth-client.ts   # better-auth browser client
└── sql.ts           # neon(DATABASE_URL) — Neon serverless client
```

## Auth & Routing Pattern

### Route groups
Three sections use route groups: `(stocks)`, `(admin)`, `(loans)`. Each has its own `layout.tsx` that:
1. Calls `auth.api.getSession({ headers: await headers() })`
2. Checks `session.user.section === "<section>"`
3. Redirects to login page if not authenticated
4. Renders `<AppShell section="..." username="...">` wrapping children

### No per-page auth checks
Individual page.tsx files do NOT re-check auth. The layout is the single gate. This was specifically done to eliminate the double server roundtrip that caused the sidebar first-click delay.

### Why first-click was slow (and the fix)
- Old: layout auth check + page auth check = 2 × 200–500ms server calls per navigation
- Fixed: layout-only check + `loading.tsx` skeleton = 1 server call, instant visual feedback

## DB Connections

### Neon Postgres (swing schema)
```typescript
// lib/sql.ts
import { neon } from "@neondatabase/serverless";
export const sql = neon(process.env.DATABASE_URL!);
```
Used as tagged template: `` sql`SELECT * FROM swing.signals WHERE date = CURRENT_DATE` ``

### MongoDB Atlas (auth only)
```typescript
// lib/auth.ts
const client = new MongoClient(process.env.MONGODB_URI!);
betterAuth({ database: mongodbAdapter(client.db()), ... })
```
Used only by better-auth. App data lives in Neon.

## Mobile Navigation
Desktop (md+): left sidebar with all 8 tabs flat.  
Mobile: bottom nav with 4 items:
- **Manish Logic** (home)
- **Strategies** → taps opens bottom-sheet drawer with all 5 strategy links
- **Performance**
- **Chart**

The "Strategies" button shows active state when pathname matches any of the 5 strategy hrefs.
