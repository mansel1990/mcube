import { hostname } from "node:os";
import { parseResearchArgs } from "../backtest/args";
import { runResearch } from "../backtest/run";
import { guardResearchAnytime } from "../backtest/schedule";

/** A backtest. It does not take the trading lock and it does not change live settings. */
export async function researchJob(argv: string[] = []): Promise<void> {
  const args = parseResearchArgs(argv);
  guardResearchAnytime(args.anytime, hostname());
  await runResearch(args);
}
