/**
 * The pass bar for a research run. The engine and the Research page both use this.
 * Percents are in percentage points: 0.8 means 0.8%, 15 means a 15% drawdown.
 */

export type ResearchBook = "swing" | "intraday" | "longterm";
export type ResearchSample = "building" | "heldback" | "diagnostic";

/** Official intraday building sample ends the session before held-back. */
export const INTRADAY_BUILDING_END = "2026-04-30";
export const INTRADAY_HELD_BACK_FROM = "2026-05-01";
export const INTRADAY_BUILDING_FROM = "2024-11-18";

/**
 * VWAP's 100 names and ORB's 200 names are the current index lists.
 * Join and exit dates are not stored, so this is survivorship bias.
 * A result with this limitation cannot qualify for live trading.
 */
export const INTRADAY_SURVIVORSHIP =
  "The intraday universe is the current Nifty 100 and Nifty 200, not point-in-time constituents. Names that left the index are missing. This is survivorship bias. A result with this limitation cannot qualify for live trading.";

export const SWING_SURVIVORSHIP =
  "Results with today's Nifty 500 still have residual survivorship bias. The clean-history and traded-value rules reduce it but do not remove it. Names that left the index are missing, and when each name joined is not stored.";

export const DIAGNOSTIC_VERDICT =
  "Diagnostic sample. No official pass or fail. A good diagnostic result is not evidence for live trading.";

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
  longterm: ["STATIC-NEXT", "STATIC-MID", "RADAR-NEXT", "RADAR-MID"],
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
  if (book === "longterm") {
    if (sample === "building") return { from: "2011-01-01", to: "2023-12-31" };
    return { from: "2024-01-01", to: lastCandle && lastCandle >= "2024-01-01" ? lastCandle : "2024-01-01" };
  }
  if (sample === "heldback") {
    return { from: INTRADAY_HELD_BACK_FROM, to: lastCandle && lastCandle >= INTRADAY_HELD_BACK_FROM ? lastCandle : INTRADAY_HELD_BACK_FROM };
  }
  return { from: INTRADAY_BUILDING_FROM, to: INTRADAY_BUILDING_END };
}

/** A second held-back run is refused until someone passes --force. */
export function heldbackBlock(already: readonly string[], requested: readonly string[], force: boolean): string | null {
  if (force) return null;
  const hit = requested.filter((name) => already.includes(name));
  if (hit.length === 0) return null;
  return `Held-back already used for ${hit.join(", ")}. Pass --force to run it again.`;
}

/** Variant runs are once per variant. Other runs are once per strategy. */
export function heldbackSubjects(strategies: readonly string[], variants?: readonly string[]): string[] {
  if (variants && variants.length > 0) return [...variants];
  return [...strategies];
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

export function overlapNote(aName: string, bName: string, aAlsoB: number, bAlsoA: number): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return `${aName}'s losing days also lost by ${bName}: ${pct(aAlsoB)}. ${bName}'s losing days also lost by ${aName}: ${pct(bAlsoA)}. Only the combined-book result establishes whether the pair reduces drawdown.`;
}

/** Completed trades only. Same-day exits break by timestamp, then symbol. */
export function orderedNets(trades: readonly { exitDate: string; exitTs: string; symbol: string; net: number }[]): number[] {
  return [...trades]
    .sort((a, b) => a.exitDate.localeCompare(b.exitDate) || a.exitTs.localeCompare(b.exitTs) || a.symbol.localeCompare(b.symbol))
    .map((trade) => trade.net);
}

export type EquityPoint = { date: string; value: number };

export type EquityPeriod = {
  key: string;
  start: number;
  end: number;
  profitable: boolean;
  returnPct: number;
  /** False when the window does not cover that calendar period, including the current open half-year. */
  complete: boolean;
};

export type HalfYearAccount = {
  complete: EquityPeriod[];
  incomplete: EquityPeriod[];
  profitable: number;
  completeCount: number;
  /** "3 of 5 complete half-years". The incomplete period is not in the ratio. */
  label: string;
};

/**
 * Month, half-year and year returns from equity endpoints.
 * The first period opens at `capital`. A period is profitable only when its
 * ending equity is higher than its starting equity. Returns are not summed.
 */
export function equityPeriods(
  equity: readonly EquityPoint[],
  capital: number,
  from: string,
  to: string,
  kind: "month" | "half" | "year"
): EquityPeriod[] {
  const points = [...equity].filter((point) => point.date >= from && point.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const bounds = periodBounds(from, to, kind);
  let cursor = 0;
  let start = capital;
  const out: EquityPeriod[] = [];
  for (const bound of bounds) {
    let end = start;
    while (cursor < points.length && points[cursor].date <= bound.end) {
      end = points[cursor].value;
      cursor += 1;
    }
    const returnPct = start > 0 ? ((end - start) / start) * 100 : 0;
    const complete = bound.naturalStart >= from && bound.naturalEnd <= to;
    out.push({ key: bound.key, start, end, profitable: end > start + 1e-6, returnPct, complete });
    start = end;
  }
  return out;
}

/** Complete periods only. The current open period stays in `incomplete`. */
export function halfYearAccount(periods: readonly EquityPeriod[]): HalfYearAccount {
  const complete = periods.filter((period) => period.complete);
  const incomplete = periods.filter((period) => !period.complete);
  const profitable = complete.filter((period) => period.profitable).length;
  return {
    complete,
    incomplete,
    profitable,
    completeCount: complete.length,
    label: `${profitable} of ${complete.length} complete half-years`,
  };
}

/**
 * Old variant reports printed `round(percent / 10)/10`.
 * The 2019–2023 building sample has ten half-years, so 50% became "5/10".
 * A held-back window is not ten half-years, and that label was wrong.
 */
export function legacyHalfYearLabel(pct: number): string {
  return `${Math.round(pct / 10)}/10`;
}

export function diagnosticIntradayWindow(commonStart: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(commonStart)) throw new Error("Diagnostic coverage start is missing.");
  if (commonStart > INTRADAY_BUILDING_END) {
    throw new Error(`Coverage starts ${commonStart}, after the building sample ends. There is no diagnostic window.`);
  }
  const from = commonStart < INTRADAY_BUILDING_FROM ? INTRADAY_BUILDING_FROM : commonStart;
  return { from, to: INTRADAY_BUILDING_END };
}

/** Latest first day on which every symbol has a session. A missing symbol blocks the date. */
export function commonCoverageStart(firstDays: readonly (string | null)[]): { start: string | null; missing: number } {
  const missing = firstDays.filter((day) => !day).length;
  if (firstDays.length === 0 || missing > 0) return { start: null, missing };
  let start = firstDays[0] ?? "";
  for (const day of firstDays) if (day && day > start) start = day;
  if (!start) return { start: null, missing };
  return { start, missing: 0 };
}

export function assertIntradaySampleEnd(sample: ResearchSample, window: { to: string }): void {
  if (sample !== "building" && sample !== "diagnostic") return;
  if (window.to !== INTRADAY_BUILDING_END) {
    throw new Error(`Refusing ${sample} intraday sample ending ${window.to}. It must end on ${INTRADAY_BUILDING_END}.`);
  }
}

export function assertNoHeldbackIntradayCandle(sample: ResearchSample, day: string): void {
  if ((sample === "building" || sample === "diagnostic") && day >= INTRADAY_HELD_BACK_FROM) {
    throw new Error(`Refusing ${sample} candle on ${day}. Intraday held-back starts ${INTRADAY_HELD_BACK_FROM}.`);
  }
}

export function assertBuildingWindow(sample: string, window: { from: string; to: string }, confirmHeldback = false): void {
  if (sample === "building" && window.from === "2019-01-01" && window.to === "2023-12-31") return;
  if (sample === "heldback" && confirmHeldback && window.from === "2024-01-01" && window.to >= window.from) return;
  throw new Error(`Refusing research sample ${sample} window ${window.from} through ${window.to}. The building window is 2019-01-01 through 2023-12-31.`);
}

function periodBounds(from: string, to: string, kind: "month" | "half" | "year"): { key: string; end: string; naturalStart: string; naturalEnd: string }[] {
  const out: { key: string; end: string; naturalStart: string; naturalEnd: string }[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  if (!year || !month || !endYear || !endMonth) return out;
  const seen = new Set<string>();
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = kind === "month"
      ? `${year}-${String(month).padStart(2, "0")}`
      : kind === "year"
        ? String(year)
        : `${year}-${month <= 6 ? "H1" : "H2"}`;
    const naturalStart = kind === "month"
      ? `${year}-${String(month).padStart(2, "0")}-01`
      : kind === "year"
        ? `${year}-01-01`
        : month <= 6 ? `${year}-01-01` : `${year}-07-01`;
    const naturalEnd = kind === "month"
      ? monthEnd(year, month)
      : kind === "year"
        ? `${year}-12-31`
        : month <= 6 ? `${year}-06-30` : `${year}-12-31`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ key, naturalStart, naturalEnd, end: naturalEnd < to ? naturalEnd : to });
    }
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function monthEnd(year: number, month: number): string {
  const next = new Date(Date.UTC(year, month, 1));
  next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
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
  /** Half-year hit rate from equity endpoints. When set, monthly percents are not added. */
  periodPct?: number;
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
  const periods = input.periodPct != null
    ? { pct: input.periodPct, profitable: 0, total: 0 }
    : profitablePeriods(input.monthly, quarters);
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
  if (input.sample === "diagnostic") {
    result.passed = false;
    result.failReasons = [];
    return result;
  }
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
