import { istMinutes } from "@/lib/mlive/calendar";
import { syncBroker } from "../execute";
import { runJob } from "../run";

export async function refresh(): Promise<void> {
  await runJob("refresh", async (runId) => {
    const minute = istMinutes();
    if (minute < 9 * 60 + 20 || minute > 10 * 60) return { skipped: "outside refresh window" };
    return syncBroker(runId);
  });
}
