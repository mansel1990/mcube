import { todayIst } from "@/lib/mlive/calendar";
import { audit } from "../audit";
import { q } from "../db";
import { coverUnguardedPositions } from "../execute";
import { MliveKite } from "../kite";
import { loadSettings } from "../load";
import { runJob } from "../run";

export async function cancel(): Promise<void> {
  await runJob("cancel", async (runId) => {
    const covered = await coverUnguardedPositions(runId);
    const settings = await loadSettings();
    const kite = new MliveKite(settings.dryRun);
    const rows = await q(
      `SELECT o.id, o.kite_order_id, o.symbol, o.qty, o.filled_qty
         FROM mlive.mlive_orders o
         JOIN mlive.mlive_decisions d ON d.id = o.decision_id
        WHERE d.trade_date = $1::date
          AND o.status IN ('OPEN', 'DRY', 'TRIGGER PENDING')
          AND o.filled_qty < o.qty`,
      [todayIst()]
    );
    let cancelled = 0;
    for (const row of rows) {
      const orderId = String(row.kite_order_id ?? "");
      if (!settings.dryRun && orderId && !orderId.startsWith("DRY-")) {
        try {
          await kite.cancelOrder(orderId);
        } catch (error) {
          await audit({
            actor: "engine",
            action: "order.cancel_failed",
            symbol: String(row.symbol),
            reason: error instanceof Error ? error.message : String(error),
            runId,
          });
          continue;
        }
      }
      await q(`UPDATE mlive.mlive_orders SET status = 'CANCELLED', updated_at = now() WHERE id = $1`, [row.id]);
      await audit({ actor: "engine", action: "order.cancelled", symbol: String(row.symbol), runId });
      cancelled += 1;
    }
    return { cancelled, covered };
  });
}
