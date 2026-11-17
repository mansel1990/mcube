import {
  downsampleEquity,
  losingDays,
  monthlyReturns,
  scoreResearch,
  type ResearchBook,
  type ResearchSample,
  type ScoreOutput,
} from "@/lib/mlive/research-bar";
import type { BookResult } from "./portfolio";

export type ScoredRun = {
  strategy: string;
  params: Record<string, number>;
  paramsKey: string;
  isDefault: boolean;
  book: BookResult;
  score: ScoreOutput;
  lossDays: Set<string>;
  monthly: Record<string, number>;
  equity: { date: string; value: number }[];
};

export function scoreBook(
  strategy: string,
  params: Record<string, number>,
  paramsKey: string,
  isDefault: boolean,
  result: BookResult,
  book: ResearchBook,
  sample: ResearchSample,
  window: { from: string; to: string },
  capital: number
): ScoredRun {
  const monthly = monthlyReturns(result.equity);
  const end = result.equity.length ? result.equity[result.equity.length - 1].value : capital;
  const score = scoreResearch({
    book,
    sample,
    nets: result.trades.map((trade) => trade.net),
    netPcts: result.trades.map((trade) => trade.netPct),
    monthly,
    equity: result.equity.map((point) => point.value),
    equityStart: capital,
    equityEnd: end,
    windowFrom: window.from,
    windowTo: window.to,
  });
  return {
    strategy,
    params,
    paramsKey,
    isDefault,
    book: result,
    score,
    lossDays: losingDays(result.equity),
    monthly,
    equity: downsampleEquity(result.equity),
  };
}
