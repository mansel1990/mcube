import { todayIst, istMinutes } from "@/lib/mlive/calendar";
import { decisionsFor } from "../book";
import { freshBuySizing, sendReady } from "../execute";
import { loadSettings, loadState } from "../load";
import { runJob } from "../run";
import { skipIfNoSession } from "../session";

export async function buys(): Promise<void> {
  const minute = istMinutes();
  if (minute < 9 * 60 + 40 || minute > 10 * 60) return;
  if (await skipIfNoSession("buys")) return;
  await runJob("buys", async (runId) => {
    const settings = await loadSettings();
    const state = await loadState();
    const open = await decisionsFor(todayIst(), "BUY");
    for (const decision of open) {
      if (decision.outcome === "proposed" || decision.outcome === "approved") {
        await freshBuySizing(decision, settings, state);
      }
    }
    return sendReady({ side: "BUY", chase: true, runId });
  });
}
