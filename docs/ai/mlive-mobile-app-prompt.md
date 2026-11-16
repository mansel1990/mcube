You are working in `C:\Projects\mcube` on Mansel Live (`/live-trade-mansel`). Make it installable as its **own** phone app, and polish the mobile UI. Keep `/stocks` exactly as it is.

- Keep `npm run engine:test`, `npm run lint`, `npm run build` and `npm run engine:build` green.
- Check everything in Chrome DevTools at 390×844 (iPhone 14) and 360×800 (Android), in light and dark.

## 1. A separate installable app
**The problem:** `app/layout.tsx` sets `manifest: "/manifest.json"` for the whole site, and that manifest has `start_url: "/stocks"`, so installing from any page opens `/stocks`.

**The fix:**
- Add `app/(mlive)/live-trade-mansel/manifest.ts`, served at `/live-trade-mansel/manifest.webmanifest`, with:
    - `name: "Mansel Live"`, `short_name: "Mansel Live"`, and `id: "/live-trade-mansel/"`;
    - `start_url: "/live-trade-mansel?source=pwa"` and `scope: "/live-trade-mansel/"`;
    - `display: "standalone"`, `orientation: "portrait"`;
    - `background_color` and `theme_color` from the mlive dark tokens.
    - Icons: 192, 512 and 512 maskable, in `public/mlive/`. They're a new mark: the red rounded square with the white arrow, as already shown in the mlive header. Generate PNGs from an SVG.
    - Shortcuts: Ideas, Reports, Settings.
- In `app/(mlive)/layout.tsx`, export metadata that **overrides** the root manifest for every mlive page:
    - `manifest: "/live-trade-mansel/manifest.webmanifest"`;
    - `appleWebApp: { capable: true, title: "Mansel Live", statusBarStyle: "black-translucent" }`;
    - an apple-touch-icon;
    - `themeColor`, through the viewport export, matching light and dark.
- **Service worker:**
    - Register a scoped worker for mlive: `/live-trade-mansel/sw.js` with `scope: "/live-trade-mansel/"`. It can reuse the push and notification-click logic from `public/sw.js`.
    - A notification click opens the mlive URL from the payload, or `/live-trade-mansel`.
    - Don't cache API responses: network-only for `/api/*`, with a tiny offline page that says "Offline. Trading data needs a connection."
- **An install button:** Settings → "Install app". It uses the `beforeinstallprompt` event on Android or desktop Chrome. On iOS it shows instructions instead: Share → Add to Home Screen.
- Push subscription and `MLIVE_USER_ID` behaviour stay unchanged. Re-check that subscribing from the installed app stores the subscription under the logged-in user, and show "Notifications on for this device" in Settings.

## 2. Mobile UI polish (mlive only)
- **App shell:**
    - A sticky compact header: logo, the status pill (Engine active / Waiting for Kite login), and the bell.
    - A **bottom tab bar** with Home · Ideas · Charts · Reports · More. More holds Settings and System.
        - It's 56 px tall plus `env(safe-area-inset-bottom)`, with the active tab in the brand colour.
        - Each item has an icon and a label, and a tap area of at least 44×44 px.
    - Content padding of 16 px, plus safe-area insets. Hide the top nav links under 768 px.
- **Home:**
    - The account value as a hero card, with today's change.
    - A horizontal scroll of KPI chips: Cash in Kite, Can use now, Trades today, Breaker.
    - "Waiting for you" approvals as full-width cards with large Approve and Skip buttons.
    - Holdings as cards: symbol, P&L, stop, and the GTT dot.
- **Ideas:** one card per row, with a 120 px chart and the chips wrapping.
- **Reports:**
    - Tables become stacked cards under 768 px. Each card has the symbol and net up top, then a 2-column grid of label/value pairs.
    - The tabs scroll sideways, and the filters move into a bottom sheet behind a "Filters" button.
- **Charts:** one column, charts 220 px tall, with touch tooltips (tap to show, tap elsewhere to hide).
- **Feel:**
    - Pull-to-refresh on Home, Ideas and Reports, re-fetching the APIs.
    - Skeleton loaders instead of "Loading…" text.
    - A toast for actions (approve, skip, re-check).
    - Haptic feedback on approve (`navigator.vibrate(10)`, where supported).
- **Text:** a 16 px base font on inputs (so iOS doesn't zoom), tabular numbers everywhere, and nothing narrower than 320 px causing sideways scroll.

## Tests
- A unit test that the mlive manifest has `start_url` and `scope` under `/live-trade-mansel/`, and that the root manifest is unchanged.
- A smoke test that every mlive page renders at 390 px wide, with no element wider than the viewport. Use the existing test setup, or a Playwright script if the repo has one.

## Done means
- Paste the test, lint and build output and the diff.
- Attach screenshots at 390 px of Home, Ideas, Reports → Trades and Charts, in light and dark, plus the install prompt.

**Manual step:** remove the old "MCube" home-screen app from the phone, open `https://mcubetechstudio.com/live-trade-mansel`, then install from the browser menu (Android) or Share → Add to Home Screen (iOS).
