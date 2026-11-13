import { istMinutes, todayIst } from "@/lib/mlive/calendar";
import { kiteErrorMessage, recheckDue } from "@/lib/mlive/rules";
import { audit } from "../audit";
import { raiseAlert } from "../alerts";
import { q } from "../db";
import { sendReady } from "../execute";
import { runJob } from "../run";
import { skipIfNoSession } from "../session";
import { recheckBuys } from "./recheck";

function failureText(error: unknown): string {
  return kiteErrorMessage(error);
}

export async function approvals(): Promise<void> {
  const minute = istMinutes();
  if (minute < 9 * 60 + 15 || minute > 14 * 60 + 30) {
    console.log("approvals skipped: outside approval window");
    return;
  }
  if (await skipIfNoSession("approvals")) return;
  await runJob("approvals", async (runId) => {
    const open = await q<{ id: string }>(
      `SELECT id FROM mlive.mlive_requests WHERE kind = 'recheck' AND done_at IS NULL ORDER BY id LIMIT 1`
    );
    let rechecked = 0;
    let closeRequest = false;
    if (recheckDue(minute, Boolean(open[0]))) {
      try {
        rechecked = await recheckBuys(runId);
        closeRequest = Boolean(open[0]);
      } catch (error) {
        const message = `Re-check skipped: ${failureText(error)}`;
        await audit({ actor: "engine", action: "recheck.skipped", reason: message, runId });
        await raiseAlert({ level: "problem", code: "engine_error", message, runId });
      }
    }
    const close = async () => {
      if (!closeRequest) return;
      await q(`UPDATE mlive.mlive_requests SET done_at = now() WHERE kind = 'recheck' AND done_at IS NULL`);
    };
    if (minute < 9 * 60 + 46) {
      await close();
      return { rechecked, skipped: "before send window" };
    }
    const sells = await sendReady({ side: "SELL", chase: false, runId });
    let buys: Record<string, unknown>;
    try {
      buys = await sendReady({ side: "BUY", chase: true, runId });
    } catch (error) {
      const message = `Buys skipped: ${failureText(error)}`;
      await audit({ actor: "engine", action: "buys.skipped", reason: message, runId });
      await raiseAlert({ level: "problem", code: "engine_error", message, runId });
      buys = { skipped: failureText(error) };
    }
    if (minute >= 14 * 60 + 30) {
      const expired = await q(
        `UPDATE mlive.mlive_decisions SET outcome = 'expired'
          WHERE trade_date = $1::date AND outcome = 'proposed'
          RETURNING id`,
        [todayIst()]
      );
      await close();
      return { sells, buys, expired: expired.length, rechecked };
    }
    await close();
    return { sells, buys, rechecked };
  });
}
