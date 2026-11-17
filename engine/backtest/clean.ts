import { createHash } from "node:crypto";
import type { Bar } from "../strategies/math";
import { actionsFor, type CorporateAction } from "./actions";

export const CLEAN_VERSION = "clean-1";

/** Frozen eligibility. These apply to every swing strategy. */
export const CLEAN_THRESHOLDS = {
  gapSessions: 20,
  cleanSessions: 250,
  discontinuity: 0.4,
  tradedSessions: 20,
  /** ₹10 crore. */
  minTradedValue: 100_000_000,
} as const;

export type RangeAudit = {
  symbol: string;
  from: string;
  to: string;
  bars: number;
  reason: string;
  action: "removed" | "adjusted" | "segment";
  factor?: number;
};

export type CleanedSeries = {
  segments: Bar[][];
  removed: RangeAudit[];
  adjusted: RangeAudit[];
  segmentsAudit: RangeAudit[];
  /** Sessions a new signal may not use: removed bars, and the first 249 of each segment. */
  masked: RangeAudit[];
};

export function cleanSymbol(
  symbol: string,
  raw: readonly Bar[],
  niftyDays: readonly string[],
  actions: readonly CorporateAction[] = []
): CleanedSeries {
  const removed: RangeAudit[] = [];
  const adjusted: RangeAudit[] = [];
  let bars = normalise(raw);
  const mine = actionsFor(symbol, actions);
  for (const action of mine) {
    if (action.kind !== "listing") continue;
    const before = bars.filter((bar) => bar.t < action.date);
    bars = bars.filter((bar) => bar.t >= action.date);
    if (before.length) {
      removed.push(range(symbol, before, action.note, "removed"));
    }
  }
  const factors = mine.filter((action) => action.kind !== "listing" && action.priceFactor != null && action.priceFactor > 0);
  const rejected = new Map<string, string>();
  for (let i = factors.length - 1; i >= 0; i--) {
    const action = factors[i];
    const factor = action.priceFactor as number;
    const at = bars.findIndex((bar) => bar.t >= action.date);
    if (at <= 0) continue;
    const prior = bars.slice(0, at).map(scaleBar(factor));
    const joined = [...prior, ...bars.slice(at)];
    if (discontinuous(joined[at - 1], joined[at])) {
      rejected.set(action.date, `${action.note} Factor ${factor} still left a move over 40%, so prices were not scaled.`);
      continue;
    }
    bars = joined;
    adjusted.push({
      ...range(symbol, prior, `${action.kind} ${action.date}: ${action.note}`, "adjusted"),
      factor,
    });
  }
  const forced = new Map(mine.filter((action) => action.kind !== "listing" && !(action.priceFactor != null && action.priceFactor > 0)).map((action) => [action.date, action.note]));
  const calendar = calendarIndex(niftyDays);
  const segments: Bar[][] = [];
  const segmentsAudit: RangeAudit[] = [];
  let current: Bar[] = [];
  let reason = "series start";
  const flush = () => {
    if (!current.length) return;
    segments.push(current);
    segmentsAudit.push(range(symbol, current, reason, "segment"));
    current = [];
  };
  for (const bar of bars) {
    const prev = current[current.length - 1];
    if (!prev) {
      current.push(bar);
      continue;
    }
    const sessions = sessionGap(prev.t, bar.t, calendar);
    const forcedNote = forced.get(bar.t) ?? rejected.get(bar.t);
    if (sessions > CLEAN_THRESHOLDS.gapSessions) {
      flush();
      reason = `${sessions} NIFTY sessions missing before ${bar.t}. The earlier segment stays valid.`;
      current.push(bar);
      continue;
    }
    if (forcedNote || discontinuous(prev, bar)) {
      const move = moveText(prev, bar);
      flush();
      reason = forcedNote
        ? `${forcedNote} An opening gap is not treated as proof the stored prices are valid.`
        : `Unvalidated ${move} at ${bar.t}. No listing or corporate-action record matched, so a new segment starts. Sessions before ${bar.t} stay in the earlier segment.`;
      current.push(bar);
      continue;
    }
    current.push(bar);
  }
  flush();
  const masked = [
    ...removed,
    ...segments.flatMap((segment) => maskHead(symbol, segment)),
  ];
  return { segments, removed, adjusted, segmentsAudit, masked };
}

export function fingerprintSeries(rows: readonly { symbol: string; segments: readonly (readonly Bar[])[] }[]): string {
  const hash = createHash("sha256");
  hash.update(`${CLEAN_VERSION}|${JSON.stringify(CLEAN_THRESHOLDS)}\n`);
  const ordered = [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
  for (const row of ordered) {
    for (const segment of row.segments) {
      for (const bar of segment) {
        hash.update(`${row.symbol}|${bar.t}|${bar.o}|${bar.h}|${bar.l}|${bar.c}|${bar.v}\n`);
      }
    }
  }
  return hash.digest("hex");
}

/** Signal day `at` inside one segment. History is judged before traded value. */
export function eligibilityAt(bars: readonly Bar[], at: number): "history" | "value" | "ok" {
  if (at < 0 || at >= bars.length || at < CLEAN_THRESHOLDS.cleanSessions - 1) return "history";
  const length = CLEAN_THRESHOLDS.tradedSessions;
  let sum = 0;
  for (let k = at - length + 1; k <= at; k++) sum += bars[k].c * bars[k].v;
  if (sum / length < CLEAN_THRESHOLDS.minTradedValue) return "value";
  return "ok";
}

export function tradedValue(bars: readonly Bar[], at: number): number {
  const length = CLEAN_THRESHOLDS.tradedSessions;
  if (at < length - 1) return 0;
  let sum = 0;
  for (let k = at - length + 1; k <= at; k++) sum += bars[k].c * bars[k].v;
  return sum / length;
}

function maskHead(symbol: string, segment: Bar[]): RangeAudit[] {
  const head = segment.slice(0, CLEAN_THRESHOLDS.cleanSessions - 1);
  if (!head.length) return [];
  return [range(symbol, head, `First ${head.length} sessions of the segment. A signal needs ${CLEAN_THRESHOLDS.cleanSessions} clean sessions.`, "removed")];
}

function normalise(raw: readonly Bar[]): Bar[] {
  const byDay = new Map<string, Bar>();
  for (const bar of raw) {
    const day = bar.t.slice(0, 10);
    if (!day) continue;
    byDay.set(day, { ...bar, t: day });
  }
  return [...byDay.values()].sort((a, b) => a.t.localeCompare(b.t));
}

function scaleBar(factor: number): (bar: Bar) => Bar {
  return (bar) => ({
    ...bar,
    o: bar.o * factor,
    h: bar.h * factor,
    l: bar.l * factor,
    c: bar.c * factor,
    v: factor !== 0 ? bar.v / factor : bar.v,
  });
}

function discontinuous(prev: Bar, bar: Bar): boolean {
  if (!(prev.c > 0)) return false;
  const limit = CLEAN_THRESHOLDS.discontinuity;
  return Math.abs(bar.c / prev.c - 1) > limit || Math.abs(bar.o / prev.c - 1) > limit;
}

function moveText(prev: Bar, bar: Bar): string {
  const closePct = prev.c > 0 ? ((bar.c / prev.c - 1) * 100).toFixed(1) : "n/a";
  const openPct = prev.c > 0 ? ((bar.o / prev.c - 1) * 100).toFixed(1) : "n/a";
  return `move (close ${closePct}%, open ${openPct}%)`;
}

function calendarIndex(days: readonly string[]): Map<string, number> {
  const index = new Map<string, number>();
  days.forEach((day, at) => {
    const key = day.slice(0, 10);
    if (!index.has(key)) index.set(key, at);
  });
  return index;
}

function sessionGap(prev: string, next: string, calendar: Map<string, number>): number {
  if (calendar.size === 0) return 1;
  const a = calendar.get(prev);
  const b = calendar.get(next);
  if (a == null || b == null || b <= a) return 1;
  return b - a - 1;
}

function range(symbol: string, bars: Bar[], reason: string, action: RangeAudit["action"]): RangeAudit {
  return {
    symbol,
    from: bars[0].t,
    to: bars[bars.length - 1].t,
    bars: bars.length,
    reason,
    action,
  };
}
