import type { ResearchSample } from "@/lib/mlive/research-bar";
import type { Bar } from "../strategies/math";
import { emptyContext, paramSets, type StrategyDef } from "../strategies/types";
import { selectIntraday, walkSession, type DayRules, type SessionTrade } from "./intraday-sim";
import { scoreBook, type ScoredRun } from "./score";
import { shiftDays } from "./session";

export type DayBar = { high: number; low: number; close: number; firstVolume: number; traded: number };

export async function simulateIntraday(input: {
  strategies: StrategyDef[];
  grid: boolean;
  sample: ResearchSample;
  window: { from: string; to: string };
  rules: DayRules;
  slip: number;
  tick: Map<string, number>;
  exitTime: string;
  entryAfter: string;
  stream: (symbol: string, kind: "5m" | "1m", from: string, to: string, visit: (day: string, bars: Bar[]) => void) => Promise<void>;
  orbSymbols: string[];
  vwapSymbols: string[];
  daily: (symbol: string) => Promise<Bar[]>;
  onSymbol?: (label: string) => void;
}): Promise<ScoredRun[]> {
  const scored: ScoredRun[] = [];
  const orb = input.strategies.filter((strategy) => strategy.name === "orb");
  const vwap = input.strategies.filter((strategy) => strategy.name === "vwap");
  if (orb.length) scored.push(...(await runOrb(input, orb)));
  if (vwap.length) scored.push(...(await runVwap(input, vwap)));
  return scored;
}

async function runOrb(
  input: Parameters<typeof simulateIntraday>[0],
  strategies: StrategyDef[]
): Promise<ScoredRun[]> {
  const from = shiftDays(input.window.from, -40);
  const ratio = new Map<string, Map<string, number>>();
  const atr = new Map<string, Map<string, number>>();
  for (const symbol of input.orbSymbols) {
    input.onSymbol?.(`orb ${symbol}`);
    const days: DayBar[] = [];
    await input.stream(symbol, "5m", from, input.window.to, (day, bars) => {
      if (bars.length === 0) return;
      let high = bars[0].h;
      let low = bars[0].l;
      let close = bars[0].c;
      for (const bar of bars) {
        if (bar.h > high) high = bar.h;
        if (bar.l < low) low = bar.l;
        close = bar.c;
      }
      days.push({ high, low, close, firstVolume: bars[0].v, traded: 0 });
      const prior = days.slice(-21, -1);
      if (prior.length < 20) return;
      const avg = prior.reduce((sum, row) => sum + row.firstVolume, 0) / prior.length;
      if (!(avg > 0)) return;
      const bySymbol = ratio.get(day) ?? new Map<string, number>();
      bySymbol.set(symbol, bars[0].v / avg);
      ratio.set(day, bySymbol);
      const atrValue = atrOf(days);
      if (atrValue != null) {
        const book = atr.get(symbol) ?? new Map<string, number>();
        book.set(day, atrValue);
        atr.set(symbol, book);
      }
    });
  }
  const picked = new Map<string, Set<string>>();
  for (const [day, scores] of ratio) {
    if (day < input.window.from || day > input.window.to) continue;
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([symbol]) => symbol);
    picked.set(day, new Set(top));
  }
  return collect(input, strategies, input.orbSymbols, "5m", (symbol, day) => picked.get(day)?.has(symbol) ?? false, (symbol, day) => atr.get(symbol)?.get(day));
}

async function runVwap(input: Parameters<typeof simulateIntraday>[0], strategies: StrategyDef[]): Promise<ScoredRun[]> {
  const value = new Map<string, Map<string, number>>();
  for (const symbol of input.vwapSymbols) {
    const bars = (await input.daily(symbol)).filter((bar) => bar.t <= input.window.to);
    const history: number[] = [];
    for (const bar of bars) {
      history.push(bar.c * bar.v);
      if (history.length <= 20) continue;
      const window = history.slice(-21, -1);
      const traded = window.reduce((sum, row) => sum + row, 0);
      const byDay = value.get(bar.t) ?? new Map<string, number>();
      byDay.set(symbol, traded);
      value.set(bar.t, byDay);
    }
  }
  const picked = new Map<string, Set<string>>();
  for (const [day, scores] of value) {
    if (day < input.window.from || day > input.window.to) continue;
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([symbol]) => symbol);
    picked.set(day, new Set(top));
  }
  const symbols = input.vwapSymbols.filter((symbol) => [...picked.values()].some((set) => set.has(symbol)));
  return collect(input, strategies, symbols, "1m", (symbol, day) => picked.get(day)?.has(symbol) ?? false, () => undefined);
}

async function collect(
  input: Parameters<typeof simulateIntraday>[0],
  strategies: StrategyDef[],
  symbols: string[],
  kind: "5m" | "1m",
  allowed: (symbol: string, day: string) => boolean,
  atrFor: (symbol: string, day: string) => number | undefined
): Promise<ScoredRun[]> {
  const buckets = new Map<string, { strategy: StrategyDef; params: Record<string, number>; key: string; isDefault: boolean; trades: SessionTrade[] }>();
  for (const strategy of strategies) {
    for (const set of paramSets(strategy, input.grid)) {
      buckets.set(`${strategy.name}:${set.key}`, { strategy, params: set.params, key: set.key, isDefault: set.isDefault, trades: [] });
    }
  }
  for (const symbol of symbols) {
    input.onSymbol?.(`${kind} ${symbol}`);
    await input.stream(symbol, kind, input.window.from, input.window.to, (day, bars) => {
      if (!allowed(symbol, day)) return;
      for (const bucket of buckets.values()) {
        const ctx = emptyContext(bars, bucket.params);
        ctx.atr = atrFor(symbol, day);
        const trades = walkSession(bucket.strategy, ctx, {
          symbol,
          tick: input.tick.get(symbol) ?? 0.05,
          slip: input.slip,
          exitTime: input.exitTime,
          entryAfter: input.entryAfter,
        });
        bucket.trades.push(...trades);
      }
    });
  }
  const days = datesBetween(input.window.from, input.window.to);
  const scored: ScoredRun[] = [];
  for (const bucket of buckets.values()) {
    const result = selectIntraday(bucket.trades, input.rules, days);
    scored.push(scoreBook(bucket.strategy.name, bucket.params, bucket.key, bucket.isDefault, result, "intraday", input.sample, input.window, input.rules.capital));
    bucket.trades = [];
  }
  return scored;
}

function atrOf(days: DayBar[]): number | null {
  if (days.length < 16) return null;
  let sum = 0;
  const end = days.length - 2;
  for (let i = end - 13; i <= end; i++) {
    const prev = days[i - 1].close;
    const bar = days[i];
    sum += Math.max(bar.high - bar.low, Math.abs(bar.high - prev), Math.abs(bar.low - prev));
  }
  return sum / 14;
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < 800) {
    const day = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) out.push(cursor);
    cursor = shiftDays(cursor, 1);
  }
  return out;
}
