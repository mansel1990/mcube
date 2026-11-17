import { createHash } from "node:crypto";
import { addDays } from "@/lib/mlive/calendar";
import { INTRADAY_BUILDING_END, INTRADAY_BUILDING_FROM } from "@/lib/mlive/research-bar";
import { researchWindowOpen } from "../backtest/schedule";

/** Leave at least 2 GB free before a one-minute backfill starts. */
export const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;

export type MinuteProvenance = {
  source: "kite.historical";
  interval: "minute";
  symbol: string;
  month: string;
  from: string;
  to: string;
  rows: number;
  checksum: string;
  retrievedAt: string;
};

/** A new backfill may start only in the research window: 16:00–16:55 and 20:00–07:00 IST. */
export function minuteImportMayStart(minutes: number): boolean {
  return researchWindowOpen(minutes);
}

/** A backfill already going stops at 16:55 and at 07:55 IST. */
export function minuteImportMustStop(minutes: number): boolean {
  if (minutes >= 16 * 60 && minutes <= 16 * 60 + 55) return false;
  if (minutes >= 20 * 60) return false;
  if (minutes < 7 * 60 + 55) return false;
  return true;
}

export function assertFreeDisk(freeBytes: number, need = MIN_FREE_BYTES): void {
  if (!Number.isFinite(freeBytes) || freeBytes < need) {
    throw new Error(`Free disk ${Math.round(freeBytes)} bytes is below ${need}. The one-minute backfill did not start.`);
  }
}

/**
 * Day the backfill may fill through. Null means the building gap is already stored.
 * When coverage has not started, stop at the building end and do not enter held-back.
 */
export function backfillThrough(firstCoveredDay: string | null): string | null {
  if (!firstCoveredDay) return INTRADAY_BUILDING_END;
  const dayBefore = addDays(firstCoveredDay, -1);
  if (dayBefore < INTRADAY_BUILDING_FROM) return null;
  return dayBefore < INTRADAY_BUILDING_END ? dayBefore : INTRADAY_BUILDING_END;
}

/** Latest first day on which every symbol already has a session. One gap blocks the date. */
export function reliableCoverageStart(firstDays: readonly (string | null)[]): string | null {
  if (firstDays.length === 0 || firstDays.some((day) => !day)) return null;
  let start = firstDays[0] ?? "";
  for (const day of firstDays) if (day && day > start) start = day;
  return start || null;
}

export function missingSessions(expected: readonly string[], present: ReadonlySet<string>): string[] {
  return expected.filter((day) => !present.has(day));
}

export type SymbolCoverage = { symbol: string; sessions: number; missing: string[] };

export function formatCoverage(rows: readonly SymbolCoverage[]): string {
  const lines = ["One-minute coverage. Missing sessions are listed. No symbol is dropped."];
  for (const row of [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol))) {
    const missing = row.missing.length ? row.missing.join(",") : "none";
    lines.push(`${row.symbol} sessions ${row.sessions} missing ${row.missing.length}: ${missing}`);
  }
  return lines.join("\n");
}

export function formatMinuteBackfillLine(symbol: string, requested: number, received: number, stillMissing: number): string {
  return `${symbol}: requested ${requested} received ${received} still missing ${stillMissing}`;
}

/** Coverage of the whole building window, not the forward progress marker. */
export function formatMinuteCoverage(from: string, to: string, present: number, expected: number): string {
  const pct = expected > 0 ? (present / expected) * 100 : 0;
  return `1m coverage ${from}..${to}: ${pct.toFixed(1)}% (${present}/${expected} sessions)`;
}

export function candleChecksum(csv: string): string {
  return createHash("sha256").update(csv).digest("hex");
}

export function minuteProvenance(input: {
  symbol: string;
  month: string;
  from: string;
  to: string;
  rows: number;
  csv: string;
  retrievedAt: string;
}): MinuteProvenance {
  return {
    source: "kite.historical",
    interval: "minute",
    symbol: input.symbol,
    month: input.month,
    from: input.from,
    to: input.to,
    rows: input.rows,
    checksum: candleChecksum(input.csv),
    retrievedAt: input.retrievedAt,
  };
}
