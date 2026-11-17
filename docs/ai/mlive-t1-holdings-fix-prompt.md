You are working in `C:\Projects\mcube` on Mansel Live. Fix a live bug: shares bought yesterday are reported as missing and the position gets frozen.

**What happens.** Kite's holdings API reports shares bought on the previous trading day as `t1_quantity` (not yet settled) with `quantity` 0 until settlement. On 17 Nov Kite returned `HEROMOTOCO quantity 0, t1_quantity 3` (bought 16 Nov). `engine/kite.ts` `holdings()` keeps only `quantity`, so the morning reconcile in `engine/jobs/preflight.ts` saw 0, marked the position `frozen` and raised "HEROMOTOCO is frozen. Kite has 0, the system has 3." A frozen position cannot be sold by the engine and its stop is not raised by `eod-stops`. Nothing ever clears `frozen`, so it stays frozen even after the shares settle. Every buy will hit this the next morning.

## Fix
1. `engine/kite.ts`: `KiteHolding` gets `settled`, `t1` and `quantity`, where `quantity = settled + t1` (from Kite's `quantity` and `t1_quantity`). Every caller that compares against our position size uses `quantity` (preflight, late preflight, `engine/jobs/recheck.ts` in both places). Keep `settled` and `t1` in the reconciliation row for the audit trail (add `kite_t1_qty` to `mlive.mlive_reconciliations` in a new migration `scripts/sql/mlive/010_t1.sql`).
2. Reconcile unfreezes: when a frozen position reconciles `ok`, set `frozen = false`, write an audit row (`position.unfrozen`, reason "Kite now shows n shares"), and mark that position's open `position_missing_in_kite` alerts as seen.
3. Alert text when it really is missing says what Kite reported: "HEROMOTOCO is frozen. Kite has 0 settled and 0 unsettled; the system has 3."
4. Tests: a holding with `quantity 0, t1_quantity 3` against a position of 3 is `ok`; a frozen position that reconciles ok is unfrozen; a real shortfall still freezes.

Do not change anything else. Keep `npm run engine:build` and `npm run engine:test` green. Then commit and push only the files you changed, with the message: "Count yesterday's unsettled shares as held, so a fresh buy is not frozen the next morning, and unfreeze a position once Kite agrees."
