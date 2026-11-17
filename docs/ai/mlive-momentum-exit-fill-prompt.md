You are working in `C:\Projects\mcube` on Mansel Live. The Momentum XI — Anchor pilot (`M10-6`) is live from its first post-activation week-end cohort. Fix one gap before then: a weekly momentum exit must not remain unsold.

**Today.** `momentum-eod` proposes the weekly sell using Friday's close. If the stock gaps below that limit, the order can remain open until `cancel` drops it at 15:15. Momentum intentionally has no price stop, so this exit path must be actively maintained.

**Scope: only SELL decisions whose `reason_code = 'momentum_weekly'`. Do not change RS/EMA sells or GTT behavior.**

1. At initial send time, clamp quantity to the system's current remaining position and use the live quote × 0.995, rounded down to the Kite tick. Keep a LIMIT CNC order; do not use a market order. If the quote or tick is unavailable, leave the decision retryable and raise a problem alert.
2. Use Kite's regular-order modification API to update the existing order price. Do not cancel and re-send every 15 minutes: `mlive_orders` intentionally allows one order per decision, and cancel/re-send introduces partial-fill and duplicate-order races.
3. Run the watcher from the existing five-minute `sync` cadence. Re-price at most once per 15 minutes, persisted in the database so overlapping/restarted jobs are idempotent. Before acting, sync broker fills and calculate the remaining quantity from both the order and current system position.
4. Before 14:30, re-price to live × 0.995. At or after 14:30, immediately move to the aggressive stage at live × 0.98, then continue no more than once per 15 minutes.
5. At 15:10, cancel any remaining open quantity. Re-sync the broker after cancellation so a final or partial fill is recorded before carrying anything. Create one idempotent SELL decision for the next trading session—not the next calendar day—for only the remaining system quantity.
6. If shares remain after that reconciliation, raise one `needs_you` alert: `MOMENTUM SELL NOT FILLED: <symbol>, <qty> shares. Sell it in Kite.` A later manual fill or broker fill must make the carried decision harmless through send-time quantity clamping.
7. Every successful modification writes an audit row containing order ID, old limit, new limit, live price, remaining quantity and stage. Modification/cancellation failures leave the current order tracked and raise a problem alert; never assume success.
8. Preserve existing guards: frozen positions are excluded, pause blocks rule-based exits, and no order may exceed the current system quantity.

**Tests**
- A Monday gap-down order is submitted/re-priced from the live quote rather than Friday's close.
- Normal re-pricing is not more frequent than 15 minutes.
- The 14:30 aggressive stage uses live × 0.98 even if the previous modification was less than 15 minutes ago.
- Partial fills are reconciled before modification and only the remainder is carried.
- At 15:10 cancellation is confirmed, the broker is re-synced, one alert is raised and one next-trading-session decision is created.
- Quote, tick, modify and cancel failures fail closed without losing the tracked order.
- RS/EMA sells and all GTT paths are unchanged.

Keep `npm run engine:test`, `npm run engine:build`, `npx eslint . --max-warnings 0` and `npm run build` green. Commit the exit-safety change separately with the message: `Re-price momentum weekly sells through the day so a gap down cannot leave the position unsold.` Deploy and verify the engine SHA and schedule before the first cohort. Keep research-page loading and display-name changes out of this safety commit.
