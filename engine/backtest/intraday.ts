import type { ResearchSample } from "@/lib/mlive/research-bar";
import type { Bar } from "../strategies/math";
import { emptyContext, paramSets, type StrategyDef } from "../strategies/types";
import { selectIntraday, walkSession, type DayRules, type SessionTrade } from "./intraday-sim";
import { scoreBook, type ScoredRun } from "./score";
import { shiftDays } from "./session";

export type DayBar = { high: number; low: number; close: number; firstVolume: number; traded: number };

/** ORB's volume average and VWAP's traded-value rank both need 20 prior sessions. ATR needs 14. */
export const INTRADAY_WARMUP_SESSIONS = 20;

export type IntradayWarmup = {
  firstFileDay: string;
  firstTradeDay: string;
  tradeDays: string[];
  /** The read already contained 20 sessions before the sample, so the sample itself is tradable. */
  alreadyWarm: boolean;
};

export type IntradaySimulation = { scored: ScoredRun[]; note: string };

/**
 * First trade day is the session 20 file-sessions after the first file day.
 * Coverage and trading use only those days. A read that already starts after
 * the files began keeps the whole sample when 20 earlier sessions were loaded.
 */
export function intradayWarmup(input: {
  observedDays: readonly string[];
  windowDays: readonly string[];
  readFrom?: string;
  warmup?: number;
}): IntradayWarmup {
  const warmup = input.warmup ?? INTRADAY_WARMUP_SESSIONS;
  const observed = [...new Set(input.observedDays)].filter(Boolean).sort();
  const windowDays = [...input.windowDays].filter(Boolean).sort();
  if (observed.length === 0) throw new Error("No file sessions are available for the intraday warm-up.");
  const windowStart = windowDays[0] ?? observed[0];
  const alreadyWarm = input.readFrom != null && observed[0] <= shiftDays(input.readFrom, 7);
  if (alreadyWarm) {
    const prior = observed.filter((day) => day < windowStart);
    if (prior.length >= warmup) {
      return { firstFileDay: observed[0], firstTradeDay: windowStart, tradeDays: windowDays, alreadyWarm: true };
    }
  }
  if (observed.length <= warmup) {
    throw new Error(`Need ${warmup} warm-up sessions after the first file day ${observed[0]}; found ${Math.max(0, observed.length - 1)} prior sessions.`);
  }
  const firstTradeDay = observed[warmup];
  const tradeDays = windowDays.filter((day) => day >= firstTradeDay);
  if (tradeDays.length === 0) {
    throw new Error(`First trade day is ${firstTradeDay} after ${warmup} warm-up sessions from ${observed[0]}. This sample ends before that.`);
  }
  return { firstFileDay: observed[0], firstTradeDay, tradeDays, alreadyWarm: false };
}

export function intradayWarmupNote(strategy: "ORB" | "VWAP", warmup: IntradayWarmup): string {
  if (warmup.alreadyWarm) {
    return `${strategy} coverage is measured from ${warmup.firstTradeDay}; the 20-session warm-up is already in the data before this sample.`;
  }
  const file = strategy === "ORB" ? "5-minute file" : "daily file";
  return `${strategy} coverage and trading start after 20 warm-up sessions (first ${file} day ${warmup.firstFileDay}; first trade day ${warmup.firstTradeDay}).`;
}

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
  onSymbol?: (label: string, index?: number, total?: number) => void;
}): Promise<IntradaySimulation> {
  const calendar = [...new Set(
    (await input.daily("NIFTY 50"))
      .map((bar) => bar.t.slice(0, 10))
      .filter((day) => day >= input.window.from && day <= input.window.to)
  )].sort();
  if (calendar.length === 0) throw new Error("Intraday research needs the NIFTY 50 session calendar.");
  const scored: ScoredRun[] = [];
  const notes: string[] = [];
  const orb = input.strategies.filter((strategy) => strategy.name === "orb");
  const vwap = input.strategies.filter((strategy) => strategy.name === "vwap");
  if (orb.length) {
    const result = await runOrb(input, orb, calendar);
    scored.push(...result.scored);
    notes.push(result.note);
  }
  if (vwap.length) {
    const result = await runVwap(input, vwap, calendar);
    scored.push(...result.scored);
    notes.push(result.note);
  }
  return { scored, note: notes.join(" ") };
}

async function runOrb(
  input: Parameters<typeof simulateIntraday>[0],
  strategies: StrategyDef[],
  calendar: string[]
): Promise<IntradaySimulation> {
  const from = shiftDays(input.window.from, -40);
  const ratio = new Map<string, Map<string, number>>();
  const atr = new Map<string, Map<string, number>>();
  const fileDays = new Set<string>();
  for (const symbol of input.orbSymbols) {
    input.onSymbol?.(`orb ${symbol}`);
    const days: DayBar[] = [];
    await input.stream(symbol, "5m", from, input.window.to, (day, bars) => {
      if (bars.length === 0) return;
      fileDays.add(day);
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
  const warmup = intradayWarmup({ observedDays: [...fileDays], windowDays: calendar, readFrom: from });
  const picked = new Map<string, Map<string, number>>();
  for (const day of warmup.tradeDays) {
    const scores = ratio.get(day) ?? new Map<string, number>();
    const coverage = input.orbSymbols.length ? scores.size / input.orbSymbols.length : 0;
    if (coverage < 0.95) {
      throw new Error(`ORB data coverage ${Math.round(coverage * 1000) / 10}% on ${day}; need at least 95%.`);
    }
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    picked.set(day, new Map(top));
  }
  const scored = await collect(
    input,
    strategies,
    input.orbSymbols,
    "5m",
    warmup.tradeDays,
    (symbol, day) => picked.get(day)?.get(symbol) ?? null,
    (symbol, day) => atr.get(symbol)?.get(day)
  );
  return { scored, note: intradayWarmupNote("ORB", warmup) };
}

async function runVwap(
  input: Parameters<typeof simulateIntraday>[0],
  strategies: StrategyDef[],
  calendar: string[]
): Promise<IntradaySimulation> {
  const value = new Map<string, Map<string, number>>();
  const atr = new Map<string, Map<string, number>>();
  const fileDays = new Set<string>();
  for (const symbol of input.vwapSymbols) {
    const bars = (await input.daily(symbol)).filter((bar) => bar.t <= input.window.to);
    const history: number[] = [];
    const days: DayBar[] = [];
    for (const bar of bars) {
      fileDays.add(bar.t.slice(0, 10));
      days.push({ high: bar.h, low: bar.l, close: bar.c, firstVolume: 0, traded: bar.c * bar.v });
      const atrValue = atrOf(days);
      if (atrValue != null) {
        const bySymbol = atr.get(symbol) ?? new Map<string, number>();
        bySymbol.set(bar.t, atrValue);
        atr.set(symbol, bySymbol);
      }
      history.push(bar.c * bar.v);
      if (history.length <= 20) continue;
      const window = history.slice(-21, -1);
      const traded = window.reduce((sum, row) => sum + row, 0);
      const byDay = value.get(bar.t) ?? new Map<string, number>();
      byDay.set(symbol, traded);
      value.set(bar.t, byDay);
    }
  }
  const warmup = intradayWarmup({ observedDays: [...fileDays], windowDays: calendar });
  const picked = new Map<string, Map<string, number>>();
  for (const day of warmup.tradeDays) {
    const scores = value.get(day) ?? new Map<string, number>();
    const coverage = input.vwapSymbols.length ? scores.size / input.vwapSymbols.length : 0;
    if (coverage < 0.95) {
      throw new Error(`VWAP daily-data coverage ${Math.round(coverage * 1000) / 10}% on ${day}; need at least 95%.`);
    }
    const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    picked.set(day, new Map(top));
  }
  const symbols = input.vwapSymbols.filter((symbol) => [...picked.values()].some((set) => set.has(symbol)));
  return {
    scored: await collect(
      input,
      strategies,
      symbols,
      "1m",
      warmup.tradeDays,
      (symbol, day) => picked.get(day)?.get(symbol) ?? null,
      (symbol, day) => atr.get(symbol)?.get(day)
    ),
    note: intradayWarmupNote("VWAP", warmup),
  };
}

async function collect(
  input: Parameters<typeof simulateIntraday>[0],
  strategies: StrategyDef[],
  symbols: string[],
  kind: "5m" | "1m",
  calendar: string[],
  selectionScore: (symbol: string, day: string) => number | null,
  atrFor: (symbol: string, day: string) => number | undefined
): Promise<ScoredRun[]> {
  const buckets = new Map<string, { strategy: StrategyDef; params: Record<string, number>; key: string; isDefault: boolean; trades: SessionTrade[] }>();
  for (const strategy of strategies) {
    for (const set of paramSets(strategy, input.grid)) {
      buckets.set(`${strategy.name}:${set.key}`, { strategy, params: set.params, key: set.key, isDefault: set.isDefault, trades: [] });
    }
  }
  let expectedSessions = 0;
  for (const symbol of symbols) {
    for (const day of calendar) if (selectionScore(symbol, day) != null) expectedSessions += 1;
  }
  let observedSessions = 0;
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    input.onSymbol?.(`${kind} ${symbol}`, i, symbols.length);
    await input.stream(symbol, kind, input.window.from, input.window.to, (day, bars) => {
      const selected = selectionScore(symbol, day);
      if (selected == null) return;
      observedSessions += 1;
      for (const bucket of buckets.values()) {
        const ctx = emptyContext(bars, bucket.params);
        ctx.atr = atrFor(symbol, day);
        ctx.cache = new Map([["selectionScore", selected]]);
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
  const coverage = expectedSessions > 0 ? observedSessions / expectedSessions : 0;
  if (coverage < 0.95) {
    throw new Error(`${kind} selected-session coverage ${Math.round(coverage * 1000) / 10}% (${observedSessions}/${expectedSessions}); need at least 95%.`);
  }
  const scored: ScoredRun[] = [];
  for (const bucket of buckets.values()) {
    const result = selectIntraday(bucket.trades, input.rules, calendar);
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

