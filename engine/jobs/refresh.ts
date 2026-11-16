import { istMinutes } from "@/lib/mlive/calendar";
import { syncBroker } from "../execute";
import { runJob } from "../run";
import { skipIfNoSession } from "../session";

export async function refresh(): Promise<void> {
  const minute = istMinutes();
  if (minute < 9 * 60 + 20 || minute > 10 * 60) return;
  if (await skipIfNoSession("refresh")) return;
  await runJob("refresh", async (runId) => syncBroker(runId));
}
