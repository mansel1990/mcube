import { todayIst, istMinutes } from "@/lib/mlive/calendar";
import { decisionsFor } from "../book";
import { freshBuySizing, sendReady } from "../execute";
import { sendLongtermDecisions } from "../longterm/orders";
import { loadSettings, loadState } from "../load";
import { runJob } from "../run";
import { skipIfNoSession } from "../session";
import { catchUpOpen, orderSlot } from "./order-window";
import { skipUnviableFreshIdeas } from "./recheck";

export async function buys(): Promise<void> {
  const minute = istMinutes();
  const phase = orderSlot("BUY", minute);
  if (phase === "before" || phase === "closed") return;
  if (phase === "catchup" && !(await catchUpOpen("BUY", minute))) return;
  if (await skipIfNoSession("buys")) return;
  await runJob("buys", async (runId) => {
    const longterm = await sendLongtermDecisions("BUY", runId);
    await skipUnviableFreshIdeas(runId);
    const settings = await loadSettings();
    const state = await loadState();
    const open = await decisionsFor(todayIst(), "BUY");
    for (const decision of open) {
      if (decision.reasonCode === "longterm_allocation") continue;
      if (decision.outcome === "proposed" || decision.outcome === "approved") {
        await freshBuySizing(decision, settings, state);
      }
    }
    const ready = await sendReady({ side: "BUY", chase: true, runId });
    return { ...ready, longterm };
  });
}
