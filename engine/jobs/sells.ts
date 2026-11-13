import { istMinutes } from "@/lib/mlive/calendar";
import { sendReady } from "../execute";
import { runJob } from "../run";
import { skipIfNoSession } from "../session";

export async function sells(): Promise<void> {
  const minute = istMinutes();
  if (minute < 9 * 60 + 15 || minute > 9 * 60 + 35) return;
  if (await skipIfNoSession("sells")) return;
  await runJob("sells", async (runId) => {
    return sendReady({ side: "SELL", chase: false, runId });
  });
}
