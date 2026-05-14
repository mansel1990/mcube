# MCube App — Documentation Index

## Project Overview
Next.js 16 (App Router, Turbopack) dashboard connected to Neon Postgres and MongoDB Atlas.  
Three independent sections: **Stocks** (swing trading scanner UI), **Admin**, **Casa Loans**.  
Deployed on Vercel. Auto-deploys on push to `main`.

## Docs

| File | Contents |
|---|---|
| [architecture.md](architecture.md) | App structure, auth, routing, DB connections |
| [stocks-section.md](stocks-section.md) | Everything about the Stocks / swing trading UI |
| [components.md](components.md) | Reusable components — SignalCard, StrategyInfoDrawer, AppShell |
| [api-routes.md](api-routes.md) | All API route files and what they query |
| [performance-tracking.md](performance-tracking.md) | How the performance page works end-to-end |
| [session-and-auth.md](session-and-auth.md) | better-auth config, session duration, user sections |
| [deployment.md](deployment.md) | Vercel setup, env vars, build notes |

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
