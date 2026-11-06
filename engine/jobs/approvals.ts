import { istMinutes, todayIst } from "@/lib/mlive/calendar";
import { recheckDue } from "@/lib/mlive/rules";
import { q } from "../db";
import { sendReady } from "../execute";
import { runJob } from "../run";
import { recheckBuys } from "./recheck";

export async function approvals(): Promise<void> {
  const minute = istMinutes();
  if (minute < 9 * 60 + 15 || minute > 14 * 60 + 30) {
    console.log("approvals skipped: outside approval window");
    return;
  }
  await runJob("approvals", async (runId) => {
    const open = await q<{ id: string }>(
      `SELECT id FROM mlive.mlive_requests WHERE kind = 'recheck' AND done_at IS NULL ORDER BY id LIMIT 1`
    );
    let rechecked = 0;
    if (recheckDue(minute, Boolean(open[0]))) {
      rechecked = await recheckBuys(runId);
      if (open[0]) {
        await q(`UPDATE mlive.mlive_requests SET done_at = now() WHERE kind = 'recheck' AND done_at IS NULL`);
      }
    }
    if (minute < 9 * 60 + 46) return { rechecked, skipped: "before send window" };
    const sells = await sendReady({ side: "SELL", chase: false, runId });
    const buys = await sendReady({ side: "BUY", chase: true, runId });
    if (minute >= 14 * 60 + 30) {
      const expired = await q(
        `UPDATE mlive.mlive_decisions SET outcome = 'expired'
          WHERE trade_date = $1::date AND outcome = 'proposed'
          RETURNING id`,
        [todayIst()]
      );
      return { sells, buys, expired: expired.length, rechecked };
    }
    return { sells, buys, rechecked };
  });
}
