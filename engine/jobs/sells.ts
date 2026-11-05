import { istMinutes } from "@/lib/mlive/calendar";
import { sendReady } from "../execute";
import { runJob } from "../run";

export async function sells(): Promise<void> {
  await runJob("sells", async (runId) => {
    const minute = istMinutes();
    if (minute < 9 * 60 + 15 || minute > 9 * 60 + 35) return { skipped: "outside sell window" };
    return sendReady({ side: "SELL", chase: false, runId });
  });
}
