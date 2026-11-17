import {
  downsampleEquity,
  equityPeriods,
  losingDays,
  monthlyReturns,
  orderedNets,
  scoreResearch,
  type ResearchBook,
  type ResearchSample,
  type ScoreOutput,
} from "@/lib/mlive/research-bar";
import type { BookResult } from "./portfolio";

export type StressReport = {
  concentration: { n: number; profitFactor: number; cagrPct: number }[];
  execution: { profitFactor: number; cagrPct: number; note: string };
  years: { year: string; profitFactor: number; bookReturnPct: number }[];
};

export type ScoredRun = {
  strategy: string;
  /** Declarative experiment name. It is persisted with params but never changes strategy logic. */
  variant?: string;
  params: Record<string, number>;
  paramsKey: string;
  isDefault: boolean;
  book: BookResult;
  score: ScoreOutput;
  lossDays: Set<string>;
  monthly: Record<string, number>;
  equity: { date: string; value: number }[];
  stress?: StressReport;
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
  const swing = book === "swing";
  const months = swing ? equityPeriods(result.equity, capital, window.from, window.to, "month") : [];
  const halves = swing ? equityPeriods(result.equity, capital, window.from, window.to, "half") : [];
  const monthly = swing
    ? Object.fromEntries(months.map((period) => [period.key, period.returnPct]))
    : monthlyReturns(result.equity);
  const periodPct = halves.length ? (halves.filter((period) => period.profitable).length / halves.length) * 100 : 0;
  const end = result.equity.length ? result.equity[result.equity.length - 1].value : capital;
  const nets = orderedNets(result.trades);
  const score = scoreResearch({
    book,
    sample,
    nets,
    netPcts: result.trades.map((trade) => trade.netPct),
    monthly,
    equity: result.equity.map((point) => point.value),
    equityStart: capital,
    equityEnd: end,
    windowFrom: window.from,
    windowTo: window.to,
    periodPct: swing ? periodPct : undefined,
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
