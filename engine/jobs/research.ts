import { parseResearchArgs } from "../backtest/args";
import { runResearch } from "../backtest/run";

/** A backtest. It does not take the trading lock and it does not change live settings. */
export async function researchJob(argv: string[] = []): Promise<void> {
  await runResearch(parseResearchArgs(argv));
}
