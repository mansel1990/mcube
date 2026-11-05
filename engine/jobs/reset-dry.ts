import { q } from "../db";
import { withLock } from "../lock";

/** Remove simulated rows so a live book starts from real cash only. The audit log is left intact. */
export async function resetDry(): Promise<void> {
  await withLock(async () => {
    await q(`DELETE FROM mlive.mlive_fills WHERE order_id IN (SELECT id FROM mlive.mlive_orders WHERE dry_run = true)`);
    await q(
      `DELETE FROM mlive.mlive_gtts
        WHERE dry_run = true
           OR position_id IN (SELECT id FROM mlive.mlive_positions WHERE dry_run = true)`
    );
    await q(`DELETE FROM mlive.mlive_orders WHERE dry_run = true`);
    await q(`DELETE FROM mlive.mlive_positions WHERE dry_run = true`);
    await q(`DELETE FROM mlive.mlive_fund_ledger WHERE dry_run = true`);
    await q(
      `DELETE FROM mlive.mlive_approvals
        WHERE decision_id IN (SELECT id FROM mlive.mlive_decisions WHERE dry_run = true)`
    );
    await q(`DELETE FROM mlive.mlive_decisions WHERE dry_run = true`);
    console.log("reset-dry ok");
  });
}
