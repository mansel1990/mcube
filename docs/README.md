# MCube App — Documentation Index

## Project Overview
Next.js 16 (App Router, Turbopack) dashboard connected to Neon Postgres and MongoDB Atlas.  
Three independent sections: **Stocks** (swing trading scanner UI), **Admin**, **Casa Loans**.  
Deployed on Vercel. Auto-deploys on push to `main`.

## Folder Structure

| Folder | Purpose |
|---|---|
| [ai/](ai/) | Context files for AI-assisted development |
| [reference/](reference/) | How the app works today — architecture, routes, components |
| [plans/](plans/) | PRDs and implementation plans (future work) |

---

## AI Context

| File | Contents |
|---|---|
| [ai/CONTEXT_FOR_AI.md](ai/CONTEXT_FOR_AI.md) | Session bootstrap context — stack, layout, auth patterns, critical files |

---

## Reference (current app)

| File | Contents |
|---|---|
| [reference/architecture.md](reference/architecture.md) | App structure, auth, routing, DB connections |
| [reference/stocks-section.md](reference/stocks-section.md) | Everything about the Stocks / swing trading UI |
| [reference/components.md](reference/components.md) | Reusable components — SignalCard, StrategyInfoDrawer, AppShell |
| [reference/api-routes.md](reference/api-routes.md) | All API route files and what they query |
| [reference/performance-tracking.md](reference/performance-tracking.md) | How the performance page works end-to-end |
| [reference/session-and-auth.md](reference/session-and-auth.md) | better-auth config, session duration, user sections |
| [reference/deployment.md](reference/deployment.md) | Vercel setup, env vars, build notes |

---

## Plans & PRDs

### Stocks

| File | Contents |
|---|---|
| [plans/stocks/stocks-ui-redesign-prd.md](plans/stocks/stocks-ui-redesign-prd.md) | UI consolidation, trade logging, portfolio v1, PWA |
| [plans/stocks/kite-integration-prd.md](plans/stocks/kite-integration-prd.md) | Kite Connect integration & trading dashboard |
| [plans/stocks/stocks-predictions-ui-plan.md](plans/stocks/stocks-predictions-ui-plan.md) | ML predictions UI (Prophet + sentiment) |

### Admin

| File | Contents |
|---|---|
| [plans/admin/backoffice-plan.md](plans/admin/backoffice-plan.md) | Back office implementation — budget tracking, PWA push |

### Loans

| File | Contents |
|---|---|
| [plans/loans/FEATURE_SPEC_REPAYMENT_TRACKER.md](plans/loans/FEATURE_SPEC_REPAYMENT_TRACKER.md) | Loan repayment tracker feature spec |

---

## Tech Stack
| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (no /src, Turbopack) |
| Styling | Tailwind CSS v4 (`@theme` block + `@config`) — light theme |
| Components | Custom (no shadcn). Lucide-react for icons. |
| Charts | Recharts |
| Auth | better-auth (MongoDB adapter) |
| DB — stocks | Neon Postgres serverless (`@neondatabase/serverless`) |
| DB — auth | MongoDB Atlas |
| Deployment | Vercel |
