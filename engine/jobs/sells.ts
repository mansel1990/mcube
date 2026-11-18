import { istMinutes } from "@/lib/mlive/calendar";
import { sendReady } from "../execute";
import { sendLongtermDecisions } from "../longterm/orders";
import { runJob } from "../run";
import { skipIfNoSession } from "../session";

export async function sells(): Promise<void> {
  const minute = istMinutes();
  if (minute < 9 * 60 + 15 || minute > 9 * 60 + 35) return;
  if (await skipIfNoSession("sells")) return;
  await runJob("sells", async (runId) => {
    const longterm = await sendLongtermDecisions("SELL", runId);
    const ready = await sendReady({ side: "SELL", chase: false, runId });
    return { ...ready, longterm };
  });
}
