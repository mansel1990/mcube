import { istMinutes } from "@/lib/mlive/calendar";
import { coverUnguardedPositions, syncBroker } from "../execute";
import { runJob } from "../run";

export async function sync(): Promise<void> {
  const minute = istMinutes();
  if (minute === 9 * 60 + 20 || minute === 9 * 60 + 45) {
    console.log("sync skipped: sells or buys");
    return;
  }
  if (minute < 9 * 60 + 15 || minute > 15 * 60 + 30) {
    console.log("sync skipped: market closed");
    return;
  }
  await runJob("sync", async (runId) => {
    const synced = await syncBroker(runId);
    const covered = await coverUnguardedPositions(runId);
    return { ...synced, covered };
  });
}
