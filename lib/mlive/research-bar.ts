/**
 * The pass bar for a research run. The engine and the Research page both use this.
 * Percents are in percentage points: 0.8 means 0.8%, 15 means a 15% drawdown.
 */

export type ResearchBook = "swing" | "intraday";
export type ResearchSample = "building" | "heldback";

export type ResearchThresholds = {
  profitFactor: number;
  trades: number;
  halfYearsPct: number;
  maxDrawdownPct: number;
  avgNetPct: number;
};

export const RESEARCH_STRATEGIES: Record<ResearchBook, readonly string[]> = {
  swing: ["trend_breakout", "rsi2", "momentum", "ema_v2", "ema", "rs"],
  intraday: ["orb", "vwap"],
};

export function researchThresholds(book: ResearchBook, sample: ResearchSample): ResearchThresholds {
  return {
    profitFactor: sample === "heldback" ? 1.2 : book === "swing" ? 1.4 : 1.3,
    trades: book === "swing" ? 150 : 300,
    halfYearsPct: 70,
    maxDrawdownPct: book === "swing" ? 15 : 10,
    avgNetPct: book === "swing" ? 0.8 : 0.1,
  };
}

export function sampleWindow(book: ResearchBook, sample: ResearchSample, lastCandle: string | null): { from: string; to: string } {
  if (book === "swing") {
    if (sample === "building") return { from: "2019-01-01", to: "2023-12-31" };
    return { from: "2024-01-01", to: lastCandle && lastCandle >= "2024-01-01" ? lastCandle : "2024-01-01" };
  }
  if (sample === "building") return { from: "2024-11-18", to: "2026-04-30" };
  return { from: "2026-05-01", to: lastCandle && lastCandle >= "2026-05-01" ? lastCandle : "2026-05-01" };
}

/** A second held-back run is refused until someone passes --force. */
export function heldbackBlock(already: readonly string[], requested: readonly string[], force: boolean): string | null {
  if (force) return null;
  const hit = requested.filter((name) => already.includes(name));
  if (hit.length === 0) return null;
  return `Held-back already used for ${hit.join(", ")}. Pass --force to run it again.`;
}

export function windowYears(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / (365.25 * 86400000);
}

/** Intraday windows shorter than two years are counted by calendar quarter. */
export function byQuarter(book: ResearchBook, from: string, to: string): boolean {
  return book === "intraday" && windowYears(from, to) < 2;
}

export function periodKey(month: string, quarterly: boolean): string {
  const year = month.slice(0, 4);
  const part = Number(month.slice(5, 7));
  if (quarterly) return `${year}-Q${Math.ceil(part / 3)}`;
  return `${year}-${part <= 6 ? "H1" : "H2"}`;
}

export function profitablePeriods(monthly: Record<string, number>, quarterly: boolean): { pct: number; profitable: number; total: number } {
  const groups = new Map<string, number>();
  for (const [month, value] of Object.entries(monthly)) {
    if (!Number.isFinite(value)) continue;
    const key = periodKey(month, quarterly);
    groups.set(key, (groups.get(key) ?? 0) + value);
  }
  const total = groups.size;
  if (total === 0) return { pct: 0, profitable: 0, total: 0 };
  const profitable = [...groups.values()].filter((value) => value > 0).length;
  return { pct: (profitable / total) * 100, profitable, total };
}

export function profitFactor(nets: readonly number[]): number {
  let won = 0;
  let lost = 0;
  for (const net of nets) {
    if (net > 0) won += net;
    else if (net < 0) lost -= net;
  }
  if (lost === 0) return won > 0 ? 99 : 0;
  return won / lost;
}

export function worstDrawdownPct(values: readonly number[]): number {
  let peak = values[0] ?? 0;
  let worst = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    if (peak > 0) worst = Math.max(worst, ((peak - value) / peak) * 100);
  }
  return worst;
}

export function longestLosingRun(nets: readonly number[]): number {
  let run = 0;
  let longest = 0;
  for (const net of nets) {
    if (net < 0) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
}

export function cagrPct(start: number, end: number, from: string, to: string): number {
  const years = windowYears(from, to);
  if (!(start > 0) || !(end > 0) || years <= 0) return 0;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

export function monthlyReturns(equity: readonly { date: string; value: number }[]): Record<string, number> {
  const end = new Map<string, number>();
  const first = new Map<string, number>();
  for (const point of equity) {
    const month = point.date.slice(0, 7);
    if (!first.has(month)) first.set(month, point.value);
    end.set(month, point.value);
  }
  const out: Record<string, number> = {};
  let previous: number | null = null;
  for (const month of [...first.keys()].sort()) {
    const opening: number = previous ?? first.get(month) ?? 0;
    const closing: number = end.get(month) ?? opening;
    out[month] = opening > 0 ? ((closing - opening) / opening) * 100 : 0;
    previous = closing;
  }
  return out;
}

export function losingDays(equity: readonly { date: string; value: number }[]): Set<string> {
  const days = new Set<string>();
  for (let i = 1; i < equity.length; i++) {
    if (equity[i].value < equity[i - 1].value - 1e-6) days.add(equity[i].date);
  }
  return days;
}

/** Share of A's losing days that are also losing days for B. */
export function lossDayOverlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0) return 0;
  let shared = 0;
  for (const day of a) if (b.has(day)) shared += 1;
  return shared / a.size;
}

export function downsampleEquity<T>(points: readonly T[], max = 400): T[] {
  if (points.length <= max) return [...points];
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  let last = -1;
  for (let i = 0; i < max; i++) {
    const index = Math.round(i * step);
    if (index === last) continue;
    last = index;
    out.push(points[index]);
  }
  return out;
}

export type ScoreInput = {
  book: ResearchBook;
  sample: ResearchSample;
  nets: readonly number[];
  netPcts: readonly number[];
  monthly: Record<string, number>;
  equity: readonly number[];
  equityStart: number;
  equityEnd: number;
  windowFrom: string;
  windowTo: string;
};

export type ScoreOutput = {
  trades: number;
  winRate: number;
  profitFactor: number;
  avgNetPct: number;
  worstDrawdownPct: number;
  longestLosingRun: number;
  halfYearsProfitablePct: number;
  quarters: boolean;
  cagrPct: number;
  passed: boolean;
  failReasons: string[];
};

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

export function scoreResearch(input: ScoreInput): ScoreOutput {
  const trades = input.nets.length;
  const wins = input.nets.filter((net) => net > 0).length;
  const avgNetPct = input.netPcts.length ? input.netPcts.reduce((sum, value) => sum + value, 0) / input.netPcts.length : 0;
  const quarters = byQuarter(input.book, input.windowFrom, input.windowTo);
  const periods = profitablePeriods(input.monthly, quarters);
  const bar = researchThresholds(input.book, input.sample);
  const result: ScoreOutput = {
    trades,
    winRate: trades ? wins / trades : 0,
    profitFactor: roundTo(profitFactor(input.nets), 3),
    avgNetPct: roundTo(avgNetPct, 4),
    worstDrawdownPct: roundTo(worstDrawdownPct(input.equity), 4),
    longestLosingRun: longestLosingRun(input.nets),
    halfYearsProfitablePct: roundTo(periods.pct, 2),
    quarters,
    cagrPct: roundTo(cagrPct(input.equityStart, input.equityEnd, input.windowFrom, input.windowTo), 4),
    passed: false,
    failReasons: [],
  };
  const reasons: string[] = [];
  if (result.profitFactor < bar.profitFactor) reasons.push(`Profit factor ${result.profitFactor.toFixed(2)}, needs ${bar.profitFactor}`);
  if (result.trades < bar.trades) reasons.push(`Trades ${result.trades}, needs ${bar.trades}`);
  const periodName = quarters ? "quarters" : "half-years";
  if (result.halfYearsProfitablePct < bar.halfYearsPct) {
    reasons.push(`Profitable ${periodName} ${result.halfYearsProfitablePct.toFixed(0)}%, needs ${bar.halfYearsPct}%`);
  }
  if (result.worstDrawdownPct > bar.maxDrawdownPct) {
    reasons.push(`Worst drawdown ${result.worstDrawdownPct.toFixed(1)}%, needs ${bar.maxDrawdownPct}% or less`);
  }
  if (result.avgNetPct < bar.avgNetPct) reasons.push(`Average net per trade ${result.avgNetPct.toFixed(2)}%, needs ${bar.avgNetPct}%`);
  result.failReasons = reasons;
  result.passed = reasons.length === 0;
  return result;
}
