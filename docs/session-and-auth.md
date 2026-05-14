# Auth & Session

## Library
`better-auth` with MongoDB Atlas adapter + `username` and `bearer` plugins.

## Config (`lib/auth.ts`)
```typescript
session: {
  expiresIn: 365 * 24 * 60 * 60,  // 1 year — stocks users stay logged in
  updateAge: 7 * 24 * 60 * 60,    // session refreshed every 7 days (sliding window)
}
```
No manual logout required for stocks users. Session lasts 1 year from last activity.

## User model (additional fields)
```typescript
user: {
  additionalFields: {
    section: {
      type: "string",
      required: true,
      defaultValue: "stocks",
    }
  }
}
```
Valid section values: `"stocks"` | `"admin"` | `"loans"`

## Auth gate pattern
Each route group layout checks:
```typescript
const session = await auth.api.getSession({ headers: await headers() });
if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
  redirect("/auth/stocks-login");
}
```

Individual pages under the layout do NOT re-check auth (performance optimization).

## Login pages
- Stocks: `/auth/stocks-login`
- Admin: `/auth/admin-login`

## Client-side auth
```typescript
// lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient();
```

Used in `app-shell.tsx` for logout:
```typescript
await authClient.signOut();
router.push("/auth/stocks-login");
```

## Environment variables
| Var | Description |
|---|---|
| MONGODB_URI | MongoDB Atlas connection string |
| AUTH_SECRET | Secret key for session signing |
| BETTER_AUTH_URL | App base URL (for OAuth redirects) |
| NEXT_PUBLIC_APP_URL | Same as above, public |
