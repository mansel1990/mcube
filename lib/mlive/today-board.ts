import { SCHEDULE, minutesOf, type ScheduleStep } from "./schedule";

export type SeriesPoint = { date: string; value: number };
export type IndexedLine = { id: string; points: { date: string; pct: number }[] };

/** Rebase every visible series from the latest first date they all share. A series with no points in range is omitted. */
export function indexedReturns(series: readonly { id: string; points: SeriesPoint[] }[], from: string | null): { start: string | null; lines: IndexedLine[] } {
  const ranged = series
    .map((line) => ({
      id: line.id,
      points: (from ? line.points.filter((point) => point.date >= from) : line.points).filter((point) => point.value > 0),
    }))
    .filter((line) => line.points.length > 0);
  if (ranged.length === 0) return { start: null, lines: [] };
  const start = ranged.map((line) => line.points[0].date).sort().at(-1) ?? null;
  if (!start) return { start: null, lines: [] };
  const lines: IndexedLine[] = [];
  for (const line of ranged) {
    const points = line.points.filter((point) => point.date >= start);
    const base = points[0];
    if (!base || !(base.value > 0)) continue;
    lines.push({
      id: line.id,
      points: points.map((point) => ({ date: point.date, pct: (point.value / base.value - 1) * 100 })),
    });
  }
  return { start, lines };
}

export type ComingRow = { when: string; text: string };

export type PlannedDecision = {
  side: "BUY" | "SELL";
  symbol: string;
  qty: number;
  reason: string;
  auto: boolean;
};

export function comingUp(input: {
  minutes: number;
  decisions: readonly PlannedDecision[];
  longGameOn: boolean;
  schedule?: readonly ScheduleStep[];
}): ComingRow[] {
  const schedule = input.schedule ?? SCHEDULE;
  const rows: ComingRow[] = [];
  for (const decision of input.decisions) {
    const when = decision.side === "SELL" ? "09:15" : "09:40";
    if (minutesOf(when) < input.minutes) continue;
    const mode = decision.auto ? "Auto" : "Approve";
    const verb = decision.side === "SELL" ? "Sell" : "Buy";
    const shares = `${decision.qty} ${decision.qty === 1 ? "share" : "shares"}`;
    rows.push({ when, text: `${verb} ${decision.symbol} · ${shares} · ${mode} · ${decision.reason}` });
  }
  for (const step of schedule) {
    if (step.kind === "longterm-proposal" && !input.longGameOn) continue;
    if (minutesOf(step.time) < input.minutes) continue;
    const title = step.kind === "market-daily" ? "Save market data" : step.kind === "momentum-eod" ? "Momentum picks" : step.title;
    rows.push({ when: step.time, text: title });
  }
  return rows.sort((a, b) => minutesOf(a.when) - minutesOf(b.when) || a.text.localeCompare(b.text)).slice(0, 6);
}

export function marketLine(input: { trading: boolean; minutes: number; nextSession: string }): string {
  if (!input.trading) return input.nextSession ? `Market closed · next session ${input.nextSession}` : "Market closed";
  if (input.minutes < 9 * 60 + 15) {
    const left = 9 * 60 + 15 - input.minutes;
    return `Opens in ${Math.floor(left / 60)}h ${left % 60}m`;
  }
  if (input.minutes <= 15 * 60 + 30) return "Market open";
  return "Market closed";
}

/** Only a recorded failure counts. A job that never ran, including on a holiday, is not a failure. */
export function failedJobs(marks: readonly { mark: string }[]): number {
  return marks.filter((row) => row.mark === "failed").length;
}

const AUDIT_PHRASES: Record<string, string> = {
  "setting.change": "A setting changed",
  "setting.queued": "A setting was queued",
  "state.pause": "The engine was paused",
  "state.resume": "The engine was resumed",
  "fund.deposit": "Money was added",
  "fund.withdrawal": "Money was withdrawn",
  "longgame.opening": "A holding was registered to Core",
  "order.sent": "An order was sent",
  "order.filled": "An order filled",
};

export function auditPhrase(action: string): string {
  return AUDIT_PHRASES[action] ?? action.replaceAll("_", " ").replaceAll(".", " ");
}

export function relativeLabel(diffPp: number | null): string | null {
  if (diffPp == null || !Number.isFinite(diffPp)) return null;
  const sign = diffPp > 0 ? "+" : diffPp < 0 ? "−" : "";
  return `${sign}${Math.abs(diffPp).toFixed(1)} pp`;
}
