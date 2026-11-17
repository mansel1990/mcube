import { emptyContext, paramSets, type SignalContext, type StrategyDef } from "../strategies/types";
import type { Bar } from "../strategies/math";
import type { SwingRules } from "./portfolio";
import { runSwingPortfolio, type Candidate } from "./portfolio";
import { scoreBook, type ScoredRun } from "./score";
import type { ResearchSample } from "@/lib/mlive/research-bar";
import { walkSymbol } from "./walk";

export type SwingSymbol = { symbol: string; tick: number; sector: string };

export async function simulateSwing(input: {
  symbols: SwingSymbol[];
  load: (symbol: string) => Promise<Bar[]>;
  calendar: string[];
  ranks: Map<string, Float64Array>;
  rankN: Float64Array;
  indexClose: Float64Array;
  indexUp: Uint8Array;
  strategies: StrategyDef[];
  grid: boolean;
  sample: ResearchSample;
  window: { from: string; to: string };
  rules: SwingRules;
  slip: number;
  gttGap: number;
  onSymbol?: (symbol: string, index: number, total: number) => void;
}): Promise<ScoredRun[]> {
  const index = new Map(input.calendar.map((day, at) => [day, at]));
  const buckets = new Map<string, { strategy: StrategyDef; params: Record<string, number>; key: string; isDefault: boolean; candidates: Candidate[] }>();
  for (const strategy of input.strategies) {
    for (const set of paramSets(strategy, input.grid)) {
      buckets.set(`${strategy.name}:${set.key}`, { strategy, params: set.params, key: set.key, isDefault: set.isDefault, candidates: [] });
    }
  }
  const windowDays = input.calendar.filter((day) => day >= input.window.from && day <= input.window.to);
  for (let i = 0; i < input.symbols.length; i++) {
    const row = input.symbols[i];
    input.onSymbol?.(row.symbol, i, input.symbols.length);
    const bars = (await input.load(row.symbol)).filter((bar) => bar.t <= input.window.to);
    if (bars.length < 30) continue;
    const rank = input.ranks.get(row.symbol);
    for (const bucket of buckets.values()) {
      const ctx = align(bars, bucket.params, index, rank, input.rankN, input.indexClose, input.indexUp);
      const trades = walkSymbol(bucket.strategy, ctx, {
        symbol: row.symbol,
        tick: row.tick,
        slip: input.slip,
        from: input.window.from,
        to: input.window.to,
        gttGap: input.gttGap,
      });
      for (const trade of trades) bucket.candidates.push({ ...trade, sector: row.sector || row.symbol });
    }
  }
  const scored: ScoredRun[] = [];
  for (const bucket of buckets.values()) {
    const result = runSwingPortfolio(bucket.candidates, input.rules, windowDays);
    scored.push(scoreBook(bucket.strategy.name, bucket.params, bucket.key, bucket.isDefault, result, "swing", input.sample, input.window, input.rules.capital));
    bucket.candidates = [];
  }
  return scored;
}

function align(
  bars: Bar[],
  params: Record<string, number>,
  index: Map<string, number>,
  rank: Float64Array | undefined,
  rankN: Float64Array,
  indexClose: Float64Array,
  indexUp: Uint8Array
): SignalContext {
  const ctx = emptyContext(bars, params);
  for (let i = 0; i < bars.length; i++) {
    const at = index.get(bars[i].t);
    if (at == null) continue;
    if (rank) ctx.rank[i] = rank[at];
    ctx.rankN[i] = rankN[at] ?? 0;
    ctx.indexClose[i] = indexClose[at] ?? Number.NaN;
    ctx.indexUp[i] = indexUp[at] ?? 0;
  }
  return ctx;
}
