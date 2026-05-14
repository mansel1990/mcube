# AI Context — MCube Next.js App (as of 2026-05-14)

Feed this file + `C:\Projects\trading\docs\CONTEXT_FOR_AI.md` to Claude at the start of a new session.

---

## App overview
Next.js 16 App Router dashboard. Three sections: Stocks (swing trading UI), Admin, Casa Loans.  
Deployed on Vercel. Auto-deploys from GitHub `main` branch.

## Tech stack
- Framework: Next.js 16, App Router, Turbopack (no /src folder)
- Styling: Tailwind CSS v4, light theme (`--background: #F8FAFC`, `--foreground: #0F172A`)
- Icons: lucide-react
- Charts: Recharts
- Auth: better-auth (MongoDB Atlas adapter), username + bearer plugins
- DB: Neon Postgres serverless (`@neondatabase/serverless`) for stocks/swing data
- Deployment: Vercel

## Directory layout
```
app/
  (stocks)/
    layout.tsx          ← single auth gate for stocks section
    loading.tsx         ← skeleton shown during route transitions (fixes click delay)
    stocks/
      page.tsx, breakout/, ema-pullback/, vcp/, rs-resilience/, mean-reversion/
      performance/, chart/, settings/
  (admin)/, (loans)/
  api/
    auth/[...all]/
    stocks/swing/{breakout,ema-pullback,vcp,rs-resilience,mean-reversion,performance}/
    stocks/{notifications,current-price,ohlcv,tickers,suggestions}/

components/
  app-shell.tsx                           ← navigation (sidebar + mobile)
  stocks/swing/
    signal-card.tsx                       ← reusable card (AccentColor: 6 options)
    strategy-info-drawer.tsx              ← info drawer (strategy: 5 options)

lib/
  auth.ts            ← betterAuth server (MongoDB, 1-year session)
  auth-client.ts     ← browser auth client
  sql.ts             ← neon(DATABASE_URL) tagged template
```

## Auth pattern
- Each route group layout is the SINGLE auth check
- Individual page.tsx files do NOT re-check auth (removes double server roundtrip)
- `loading.tsx` provides instant visual feedback on navigation

## How to add a new strategy page
1. Create `app/(stocks)/stocks/<name>/page.tsx` + `<name>-client.tsx`
   - Clone from `app/(stocks)/stocks/vcp/` — it's the cleanest template
   - Change: API URL, accentColor, icon, title, levelLabel, strategy key for info drawer
2. Create `app/api/stocks/swing/<name>/route.ts` — query `swing.<name>_signals`
3. Add to `NAV_CONFIG.stocks` in `components/app-shell.tsx` (+ TAB_COLORS if new color)
4. If strategy goes in STRATEGY_HREFS (mobile grouped tab) — add href there too
5. Add strategy info to `STRATEGY_INFO` in `strategy-info-drawer.tsx`
6. Add to `STRATEGY_META` in `performance-client.tsx`

## Mobile navigation (stocks)
Bottom nav has 4 items: Manish Logic | Strategies (sheet) | Performance | Chart.  
All 5 strategy pages are accessible via the "Strategies" bottom-sheet.  
Desktop sidebar shows all 8 items flat.

## Critical files
| Purpose | File |
|---|---|
| Sidebar / nav | `components/app-shell.tsx` |
| Signal card | `components/stocks/swing/signal-card.tsx` |
| Strategy info drawer | `components/stocks/swing/strategy-info-drawer.tsx` |
| Performance page | `app/(stocks)/stocks/performance/performance-client.tsx` |
| Breakout page (template) | `app/(stocks)/stocks/breakout/breakout-client.tsx` |
| Stocks layout (auth gate) | `app/(stocks)/layout.tsx` |
| DB connection | `lib/sql.ts` |
| Auth config | `lib/auth.ts` |

## Common build errors
- Recharts Tooltip formatter: must be `(v: number | undefined) => [...]` and use `v ?? 0`
- New Tailwind colors must exist in the theme or be standard Tailwind colors (purple/rose/teal are fine)

## Env vars needed
DATABASE_URL, MONGODB_URI, AUTH_SECRET, BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL

## Before every push
```bash
bash -c "cd /c/Projects/mcube && npx next build > /tmp/build.log 2>&1; echo EXIT:\$?; tail -20 /tmp/build.log"
```
Must exit 0. Check for TypeScript errors in the tail output.
