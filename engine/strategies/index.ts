import { emaPullback } from "./ema";
import { emaV2 } from "./ema-v2";
import { momentum } from "./momentum";
import { orbStrategy } from "./orb";
import { rsi2 } from "./rsi2";
import { rsResilience } from "./rs";
import { trendBreakout } from "./trend-breakout";
import type { BookName, StrategyDef } from "./types";
import { vwapStrategy } from "./vwap";

export const STRATEGIES: StrategyDef[] = [
  trendBreakout,
  rsi2,
  momentum,
  emaV2,
  emaPullback,
  rsResilience,
  orbStrategy,
  vwapStrategy,
];

export function strategyByName(name: string): StrategyDef | undefined {
  return STRATEGIES.find((strategy) => strategy.name === name);
}

export function strategiesFor(book: BookName, names?: readonly string[]): StrategyDef[] {
  const wanted = names?.length ? new Set(names) : null;
  const list = STRATEGIES.filter((strategy) => strategy.book === book && (!wanted || wanted.has(strategy.name)));
  if (wanted) {
    const known = new Set(list.map((strategy) => strategy.name));
    const missing = [...wanted].filter((name) => !known.has(name));
    if (missing.length) throw new Error(`Unknown ${book} strategy: ${missing.join(", ")}`);
  }
  return list;
}
