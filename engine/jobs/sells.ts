import { istMinutes } from "@/lib/mlive/calendar";
import { sendReady } from "../execute";
import { sendLongtermDecisions } from "../longterm/orders";
import { runJob } from "../run";
import { skipIfNoSession } from "../session";
import { catchUpOpen, orderSlot } from "./order-window";

export async function sells(): Promise<void> {
  const minute = istMinutes();
  const phase = orderSlot("SELL", minute);
  if (phase === "before" || phase === "closed") return;
  if (phase === "catchup" && !(await catchUpOpen("SELL", minute))) return;
  if (await skipIfNoSession("sells")) return;
  await runJob("sells", async (runId) => {
    const longterm = await sendLongtermDecisions("SELL", runId);
    const ready = await sendReady({ side: "SELL", chase: false, runId });
    return { ...ready, longterm };
  });
}
