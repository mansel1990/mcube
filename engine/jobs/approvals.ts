import { istMinutes, todayIst } from "@/lib/mlive/calendar";
import { q } from "../db";
import { sendReady } from "../execute";
import { runJob } from "../run";

export async function approvals(): Promise<void> {
  const minute = istMinutes();
  if (minute < 9 * 60 + 46 || minute > 14 * 60 + 30) {
    console.log("approvals skipped: outside approval window");
    return;
  }
  await runJob("approvals", async (runId) => {
    const sells = await sendReady({ side: "SELL", chase: false, runId });
    const buys = await sendReady({ side: "BUY", chase: true, runId });
    if (minute >= 14 * 60 + 30) {
      const expired = await q(
        `UPDATE mlive.mlive_decisions SET outcome = 'expired'
          WHERE trade_date = $1::date AND outcome = 'proposed'
          RETURNING id`,
        [todayIst()]
      );
      return { sells, buys, expired: expired.length };
    }
    return { sells, buys };
  });
}
