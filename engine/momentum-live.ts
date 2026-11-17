import { VERIFIED_ACTIONS } from "./backtest/actions";
import { cleanSymbol, eligibilityAt } from "./backtest/clean";
import { dailyBars, universe } from "./backtest/data";
import { mq } from "./db";

export type MomentumCohortRow = {
  symbol: string;
  rank: number;
  return90: number;
  signalClose: number;
  sector: string;
};

export type MomentumSnapshot = {
  signalDate: string;
  marketUp: boolean;
  ranked: number;
  cohort: MomentumCohortRow[];
};

export type MomentumRankInput = {
  symbol: string;
  return90: number;
  signalClose: number;
  sector: string;
  eligible: boolean;
};

export async function loadMomentumSnapshot(signalDate: string): Promise<MomentumSnapshot> {
  const nifty = (await dailyBars("NIFTY 50")).filter((bar) => bar.t <= signalDate);
  if (nifty.at(-1)?.t !== signalDate) throw new Error(`Momentum scan needs NIFTY 50 candle ${signalDate}`);
  const calendar = nifty.map((bar) => bar.t);
  const at = calendar.length - 1;
  const marketUp = indexAboveAverage(nifty.map((bar) => bar.c), 200);
  const baseDate = calendar[at - 90];
  if (!baseDate) throw new Error("Momentum scan needs 90 prior NIFTY sessions");
  const listed = await universe("nifty500");
  const sectorRows = await mq<{ symbol: string; industry: string | null }>(
    `SELECT symbol, industry FROM universe WHERE nifty500 AND industry IS NOT NULL AND industry <> ''`
  );
  const sectors = new Map(sectorRows.map((row) => [row.symbol, row.industry ?? ""]));
  const points: MomentumRankInput[] = [];
  for (const item of listed) {
    const raw = (await dailyBars(item.symbol)).filter((bar) => bar.t <= signalDate);
    const cleaned = cleanSymbol(item.symbol, raw, calendar, VERIFIED_ACTIONS);
    const segment = cleaned.segments.find((rows) => rows.some((bar) => bar.t === signalDate));
    if (!segment) continue;
    const end = segment.findIndex((bar) => bar.t === signalDate);
    const start = segment.findIndex((bar) => bar.t === baseDate);
    if (start < 0 || end < 0) continue;
    const base = segment[start].c;
    const close = segment[end].c;
    if (!(base > 0) || !(close > 0)) continue;
    points.push({
      symbol: item.symbol,
      return90: close / base - 1,
      signalClose: close,
      sector: sectors.get(item.symbol) ?? item.symbol,
      eligible: eligibilityAt(segment, end) === "ok",
    });
  }
  const cohort = selectMomentumCohort(points, marketUp);
  return { signalDate, marketUp, ranked: points.length, cohort };
}

export function selectMomentumCohort(points: readonly MomentumRankInput[], marketUp: boolean): MomentumCohortRow[] {
  const ordered = [...points].sort((a, b) => b.return90 - a.return90 || a.symbol.localeCompare(b.symbol));
  const cohort: MomentumCohortRow[] = [];
  for (const point of ordered) {
    const better = ordered.filter((other) => other.return90 > point.return90).length;
    if (better >= 8) break;
    if (!point.eligible || !marketUp) continue;
    cohort.push({ ...point, rank: better + 1 });
  }
  return cohort;
}

export function indexAboveAverage(closes: readonly number[], sessions: number): boolean {
  if (sessions < 1 || closes.length < sessions) return false;
  const window = closes.slice(-sessions);
  if (window.some((close) => !(close > 0) || !Number.isFinite(close))) return false;
  const average = window.reduce((sum, close) => sum + close, 0) / sessions;
  return window[window.length - 1] > average;
}

export function isWeeklySignalDay(day: string, nextTradingSession: string): boolean {
  return isoWeek(day) !== isoWeek(nextTradingSession);
}

export function momentumCohortAction(input: {
  enabled: boolean;
  weeklySignalDay: boolean;
  alreadyProcessed: boolean;
}): "disabled" | "carry" | "form" {
  if (!input.enabled) return "disabled";
  if (!input.weeklySignalDay || input.alreadyProcessed) return "carry";
  return "form";
}

export type MomentumEodPlan = {
  formCohort: boolean;
  writeIdeas: boolean;
  buyDecisions: boolean;
  proposeWeeklyExits: boolean;
  sellWatch: boolean;
};

/** Parked momentum still exits and watches sells. It does not form a buy cohort or write ideas. */
export function momentumEodPlan(input: { entriesEnabled: boolean; weeklySignalDay: boolean }): MomentumEodPlan {
  return {
    formCohort: input.entriesEnabled && input.weeklySignalDay,
    writeIdeas: input.entriesEnabled,
    buyDecisions: false,
    proposeWeeklyExits: input.weeklySignalDay,
    sellWatch: true,
  };
}

/** The sell watcher reprices during the session. After 15:30 it would cancel, so the evening job must not call it. */
export function momentumSellWatchShouldRun(minutes: number): boolean {
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

export function momentumCohortIsCurrent(signalDate: string, day: string, firstTradeDay: string): boolean {
  return day === signalDate || (day >= firstTradeDay && isoWeek(day) === isoWeek(firstTradeDay));
}

function isoWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const week = Math.ceil(((date.getTime() - start) / 86400000 + 1) / 7);
  return `${year}-${week}`;
}
