import { istMinutes } from "@/lib/mlive/calendar";
import { coverUnguardedPositions, syncBroker } from "../execute";
import { carryUnfilledMomentumSells, maintainMomentumWeeklySells } from "../momentum-sell-watch";
import { maintainLongGameOrders } from "../longterm/watch";
import { runJob } from "../run";
import { skipIfNoSession } from "../session";

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
  if (await skipIfNoSession("sync")) return;
  await runJob("sync", async (runId) => {
    let synced = await syncBroker(runId);
    const watch = await maintainMomentumWeeklySells(runId);
    await maintainLongGameOrders();
    if (watch.cancellationsRequested) synced = await syncBroker(runId);
    await carryUnfilledMomentumSells(runId);
    const covered = await coverUnguardedPositions(runId);
    return { ...synced, covered, momentumSellCancellations: watch.cancellationsRequested };
  });
}
