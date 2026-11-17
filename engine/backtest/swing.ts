import { defaultParams, emptyContext, paramSets, type SignalContext, type StrategyDef } from "../strategies/types";
import type { Bar } from "../strategies/math";
import { eligibilityAt } from "./clean";
import type { SwingRules } from "./portfolio";
import { runSwingPortfolio, type Candidate } from "./portfolio";
import { scoreBook, type ScoredRun } from "./score";
import type { ResearchSample } from "@/lib/mlive/research-bar";
import { bookOutcome, concentrationKeys, executionNote, withExecutionSlip, yearRows } from "./stress";
import { walkSymbol, type GateStats, type WalkStats } from "./walk";

export type SwingSymbol = { symbol: string; tick: number; sector: string };

export type SwingOutput = {
  scored: ScoredRun[];
  eligibility: Record<string, GateStats>;
  fills: WalkStats;
};

const FROZEN = new Set(["rs", "momentum", "trend_breakout"]);

export async function simulateSwing(input: {
  symbols: SwingSymbol[];
  load: (symbol: string) => Promise<Bar[][]>;
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
  limitOffset: number;
  chasePct: number;
  onSymbol?: (symbol: string, index: number, total: number) => void;
  /** Filled with the RS limit-order count when RS is in the run. */
  sink?: { text: string };
  intraday?: (symbol: string, day: string) => Bar[] | undefined;
}): Promise<SwingOutput> {
  const index = new Map(input.calendar.map((day, at) => [day, at]));
  const buckets = new Map<string, Bucket>();
  for (const strategy of input.strategies) {
    for (const set of paramSets(strategy, input.grid)) {
      const keep = set.isDefault && FROZEN.has(strategy.name);
      buckets.set(`${strategy.name}:${set.key}`, {
        strategy,
        params: set.params,
        key: set.key,
        isDefault: set.isDefault,
        candidates: [],
        retain: keep,
      });
    }
  }
  if (input.grid) {
    for (const extra of variantBuckets(input.strategies)) {
      buckets.set(`${extra.strategy.name}:${extra.key}`, extra);
    }
  }
  const fills: WalkStats = { attempted: 0, unfilled: 0, dailyApprox: 0, intraday: 0, ambiguous: 0 };
  const eligibility = new Map<string, GateStats>();
  const windowDays = input.calendar.filter((day) => day >= input.window.from && day <= input.window.to);
  for (let i = 0; i < input.symbols.length; i++) {
    const row = input.symbols[i];
    input.onSymbol?.(row.symbol, i, input.symbols.length);
    const segments = await input.load(row.symbol);
    for (const bars of segments) {
      const trimmed = bars.filter((bar) => bar.t <= input.window.to);
      if (trimmed.length < 30) continue;
      for (const bucket of buckets.values()) {
        const ctx = align(trimmed, bucket.params, index, input.ranks.get(row.symbol), input.rankN, input.indexClose, input.indexUp);
        const gateStats = gateFor(eligibility, bucket);
        const walked = walkSymbol(bucket.strategy, ctx, {
          symbol: row.symbol,
          tick: row.tick,
          slip: input.slip,
          from: input.window.from,
          to: input.window.to,
          gttGap: bucket.strategy.name === "ema" || bucket.strategy.name === "rs" ? input.gttGap : 0,
          limitOffset: input.limitOffset,
          chasePct: input.chasePct,
          stats: bucket.isDefault && FROZEN.has(bucket.strategy.name) ? fills : undefined,
          sessionBars: (day) => input.intraday?.(row.symbol, day),
          riskGap: bucket.strategy.name === "rs" ? 0.01 : undefined,
          gate: (at) => eligibilityAt(trimmed, at),
          gateStats,
        });
        for (const trade of [...walked.trades, ...walked.opens]) {
          bucket.candidates.push({ ...trade, sector: row.sector || row.symbol, tick: row.tick });
        }
      }
    }
  }
  const scored: ScoredRun[] = [];
  const held = new Map<string, Candidate[]>();
  for (const bucket of buckets.values()) {
    const rules = bucket.cap == null ? input.rules : { ...input.rules, maxOrderPct: bucket.cap };
    const params = bucket.cap == null ? bucket.params : { ...bucket.params, capPct: bucket.cap * 100 };
    const skipMomentum25 = !input.grid && bucket.strategy.name === "momentum" && bucket.isDefault && bucket.cap == null;
    if (!skipMomentum25) {
      const result = runSwingPortfolio(bucket.candidates, rules, windowDays);
      const row = scoreBook(bucket.strategy.name, params, bucket.key, bucket.isDefault, result, "swing", input.sample, input.window, input.rules.capital);
      if (!input.grid) attachStress(row, bucket.candidates, rules, windowDays, input);
      scored.push(row);
    }
    if (bucket.retain || skipMomentum25) held.set(`${bucket.strategy.name}:${bucket.key}`, bucket.candidates);
    bucket.candidates = [];
  }
  const capRules = { ...input.rules, maxOrderPct: 0.15 };
  for (const name of ["momentum", "rs"] as const) {
    const bucket = [...buckets.values()].find((item) => item.strategy.name === name && item.isDefault);
    const candidates = bucket ? held.get(`${name}:${bucket.key}`) : undefined;
    if (!bucket || !candidates) continue;
    const result = runSwingPortfolio(candidates, capRules, windowDays);
    const row = scoreBook(name, { ...bucket.params, capPct: 15 }, `${bucket.key}&cap=15`, false, result, "swing", input.sample, input.window, input.rules.capital);
    if (!input.grid) attachStress(row, candidates, capRules, windowDays, input);
    scored.push(row);
    held.set(`${name}:cap15`, candidates);
  }
  const pairRules = input.grid
    ? { ...input.rules, maxPerStrategy: Math.max(1, Math.floor(input.rules.maxOpen / 2)) }
    : { ...input.rules, maxOrderPct: 0.15, maxPerStrategy: 3 };
  const momentumDefault = [...buckets.values()].find((item) => item.strategy.name === "momentum" && item.isDefault);
  const rsDefault = [...buckets.values()].find((item) => item.strategy.name === "rs" && item.isDefault);
  const trendDefault = [...buckets.values()].find((item) => item.strategy.name === "trend_breakout" && item.isDefault);
  const momentumBook = momentumDefault ? held.get(`momentum:${momentumDefault.key}`) : undefined;
  const rsBook = rsDefault ? held.get(`rs:${rsDefault.key}`) : undefined;
  const trendBook = trendDefault ? held.get(`trend_breakout:${trendDefault.key}`) : undefined;
  if (rsBook && momentumBook) {
    scored.push(scorePair("rs+momentum", rsBook, momentumBook, pairRules, windowDays, input));
  }
  if (trendBook && momentumBook) {
    scored.push(scorePair("trend_breakout+momentum", trendBook, momentumBook, pairRules, windowDays, input));
  }
  if (input.grid) {
    const momBest = bestOf(scored.filter((row) => row.strategy === "momentum" && row.params.capPct === 15));
    const rsBest = bestOf(scored.filter((row) => row.strategy === "rs" && row.params.capPct === 15));
    if (momBest && rsBest) {
      const momCandidates = candidatesFor(momBest, held, momentumDefault?.key);
      const rsCandidates = candidatesFor(rsBest, held, rsDefault?.key);
      if (momCandidates && rsCandidates) {
        const tight = { ...capRules, maxPerStrategy: Math.max(1, Math.floor(input.rules.maxOpen / 2)) };
        const row = scorePair("rs+momentum", rsCandidates, momCandidates, tight, windowDays, input);
        row.paramsKey = `pair-15&rs=${rsBest.paramsKey}&momentum=${momBest.paramsKey}`;
        scored.push(row);
      }
    }
  }
  if (input.sink && (rsDefault || fills.attempted || fills.unfilled)) {
    input.sink.text = `Limit orders for RS, momentum and trend breakout: ${fills.attempted} entry attempts, ${fills.unfilled} not filled. Daily-candle approximations: ${fills.dailyApprox ?? 0}. Intraday fills: ${fills.intraday ?? 0}. Same-bar entry and stop, order unknown: ${fills.ambiguous ?? 0}.`;
  }
  held.clear();
  return { scored, eligibility: Object.fromEntries(eligibility), fills };
}

function gateFor(eligibility: Map<string, GateStats>, bucket: Bucket): GateStats | undefined {
  if (!bucket.isDefault || !FROZEN.has(bucket.strategy.name)) return undefined;
  const existing = eligibility.get(bucket.strategy.name);
  if (existing) return existing;
  const created: GateStats = { raw: 0, history: 0, value: 0, kept: 0 };
  eligibility.set(bucket.strategy.name, created);
  return created;
}

function attachStress(
  row: ScoredRun,
  candidates: Candidate[],
  rules: SwingRules,
  calendar: string[],
  input: { slip: number; window: { from: string; to: string }; rules: SwingRules }
): void {
  const capital = input.rules.capital;
  const from = input.window.from;
  const to = input.window.to;
  row.stress = {
    concentration: [1, 3, 5].map((n) => {
      const replay = bookOutcome(rules, candidates, calendar, capital, from, to, concentrationKeys(row.book.trades, n));
      return { n, profitFactor: replay.profitFactor, cagrPct: replay.cagrPct };
    }),
    execution: (() => {
      const replay = bookOutcome(rules, withExecutionSlip(candidates, input.slip * 2), calendar, capital, from, to);
      return { profitFactor: replay.profitFactor, cagrPct: replay.cagrPct, note: executionNote() };
    })(),
    years: yearRows(row.book.trades, row.book.equity, capital, from, to),
  };
}

type Bucket = {
  strategy: StrategyDef;
  params: Record<string, number>;
  key: string;
  isDefault: boolean;
  candidates: Candidate[];
  cap?: number;
  retain?: boolean;
};

function variantBuckets(strategies: StrategyDef[]): Bucket[] {
  const out: Bucket[] = [];
  const momentum = strategies.find((strategy) => strategy.name === "momentum");
  const rs = strategies.find((strategy) => strategy.name === "rs");
  if (momentum) {
    const base = defaultParams(momentum);
    out.push(variant(momentum, { ...base, exitTop: 25, stopPct: 0.12, indexDays: 0 }, "mom-b"));
    out.push(variant(momentum, { ...base, exitTop: 25, stopPct: 0.12, indexDays: 50 }, "mom-c"));
  }
  if (rs) {
    const base = defaultParams(rs);
    out.push(variant(rs, { ...base, tight: 1, halfR: 0 }, "rs-b"));
    out.push(variant(rs, { ...base, tight: 0, halfR: 3 }, "rs-c"));
  }
  return out;
}

function variant(strategy: StrategyDef, params: Record<string, number>, key: string): Bucket {
  return { strategy, params, key, isDefault: false, candidates: [], cap: 0.15, retain: true };
}

function bestOf(rows: ScoredRun[]): ScoredRun | null {
  let best: ScoredRun | null = null;
  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }
    if (row.score.profitFactor !== best.score.profitFactor) {
      if (row.score.profitFactor > best.score.profitFactor) best = row;
      continue;
    }
    if (row.score.worstDrawdownPct !== best.score.worstDrawdownPct) {
      if (row.score.worstDrawdownPct < best.score.worstDrawdownPct) best = row;
      continue;
    }
    if (row.score.cagrPct > best.score.cagrPct) best = row;
  }
  return best;
}

function candidatesFor(row: ScoredRun, held: Map<string, Candidate[]>, defaultKey: string | undefined): Candidate[] | undefined {
  if (row.paramsKey === "mom-b" || row.paramsKey === "mom-c" || row.paramsKey === "rs-b" || row.paramsKey === "rs-c") {
    return held.get(`${row.strategy}:${row.paramsKey}`);
  }
  if (defaultKey && row.paramsKey === `${defaultKey}&cap=15`) return held.get(`${row.strategy}:cap15`);
  return undefined;
}

function scorePair(
  name: string,
  left: Candidate[],
  right: Candidate[],
  rules: SwingRules,
  calendar: string[],
  input: { grid: boolean; slip: number; sample: ResearchSample; window: { from: string; to: string }; rules: SwingRules }
): ScoredRun {
  const candidates = [
    ...left.map((candidate) => ({ ...candidate, group: "left" })),
    ...right.map((candidate) => ({ ...candidate, group: "right" })),
  ];
  const result = runSwingPortfolio(candidates, rules, calendar);
  const row = scoreBook(
    name,
    { capPct: rules.maxOrderPct * 100, maxPerStrategy: rules.maxPerStrategy ?? 0 },
    "pair",
    false,
    result,
    "swing",
    input.sample,
    input.window,
    input.rules.capital
  );
  if (!input.grid) attachStress(row, candidates, rules, calendar, input);
  return row;
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
