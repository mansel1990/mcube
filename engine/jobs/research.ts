import { research } from "../research";
import { runJob } from "../run";
import { swingSwitch } from "./swing-switch";

export async function researchJob(): Promise<void> {
  await runJob("research", async () => {
    await research();
    await swingSwitch();
    return { job: "research" };
  });
}
