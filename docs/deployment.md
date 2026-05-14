# Deployment — Vercel

## Platform
- **Service:** Vercel
- **Repo:** (connected to GitHub — auto-deploys on push to `main`)
- **Framework:** Next.js (auto-detected)
- **Root directory:** `/` (project root)

## Auto-deploy flow
1. Push to `main` branch on GitHub
2. Vercel picks up the push, runs `next build`
3. If build passes → deployment goes live
4. If TypeScript errors → build fails, previous version stays live

## Build checks before pushing
```bash
# In C:\Projects\mcube\
npx next build
```
Build must exit 0. Any TypeScript errors block the deploy.

## Environment variables (set in Vercel dashboard)
| Var | Description |
|---|---|
| DATABASE_URL | Neon Postgres connection string |
| MONGODB_URI | MongoDB Atlas connection string |
| AUTH_SECRET | better-auth session secret |
| BETTER_AUTH_URL | Production URL (e.g. https://mcube.vercel.app) |
| NEXT_PUBLIC_APP_URL | Same as BETTER_AUTH_URL |

## Common TypeScript build errors seen historically
- `Formatter<number, "Cumulative P&L">` — Recharts tooltip formatter must accept `number | undefined` and use `v ?? 0` fallback
- Type errors in `performance-client.tsx` around Recharts generics

## Development
```bash
cd C:\Projects\mcube
npm run dev         # http://localhost:3000
```

## Neon DB note
The app uses the `swing` schema for scanner data. There is a separate `stocks` schema used by another feature (daily OHLCV charts). Do NOT drop or alter the `stocks` schema.
