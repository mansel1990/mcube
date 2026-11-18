export type ScheduleGroup = "before" | "market" | "evening";

export type ScheduleStep = {
  kind: string;
  time: string;
  title: string;
  description: string;
  group: ScheduleGroup;
};

/** The jobs engine/deploy.sh installs, one row each. Repeats stay one step. */
export const SCHEDULE: ScheduleStep[] = [
  { kind: "remind", time: "08:30", title: "Login reminder", description: "Asks you to connect Kite before the open.", group: "before" },
  { kind: "preflight", time: "08:35", title: "Morning checks", description: "Reads cash, holidays and the rules before anyone buys.", group: "before" },
  { kind: "sells", time: "09:20", title: "Sells", description: "Sends the sells that were already decided.", group: "market" },
  { kind: "refresh", time: "09:40", title: "Refresh prices", description: "Updates marks before the buy run.", group: "market" },
  { kind: "buys", time: "09:45", title: "Buys", description: "Places the morning buys that passed the rules.", group: "market" },
  { kind: "approvals", time: "09:45", title: "Fills and stops", description: "Fills and stops, every minute 09:45–14:30.", group: "market" },
  { kind: "sync", time: "09:00", title: "Sync with Kite", description: "Sync with Kite, every 5 minutes through the session.", group: "market" },
  { kind: "cancel", time: "15:15", title: "Cancel leftovers", description: "Cancels orders that are still open after the close.", group: "market" },
  { kind: "eod", time: "15:45", title: "Market close", description: "Writes the account value after the session.", group: "evening" },
  { kind: "longterm-proposal", time: "16:10", title: "Long Game check", description: "After the close, prepares a Long Game allocation change for approval when Long Game is live.", group: "evening" },
  { kind: "import-ideas", time: "18:20", title: "Nightly scan", description: "Copies the evening ideas into the book.", group: "evening" },
  { kind: "eod-stops", time: "19:45", title: "Stop updates", description: "Raises stops that the rules moved.", group: "evening" },
  { kind: "eod-final", time: "19:50", title: "Daily report", description: "Closes the day and writes the report.", group: "evening" },
  { kind: "research-queue", time: "20:00", title: "Research queue", description: "Runs queued backtests overnight.", group: "evening" },
  { kind: "market-daily", time: "20:05", title: "Save today's candles", description: "Stores today's daily and 5-minute candles, including NIFTY 50.", group: "evening" },
  { kind: "momentum-eod", time: "20:40", title: "Momentum weekly list", description: "Builds or carries the M10-6 cohort after fresh daily candles.", group: "evening" },
];

export const SCHEDULE_KINDS = SCHEDULE.map((step) => step.kind);

/** Retired Intraday keeps the daily candle job and drops the 5-minute wording. No Intraday-only step is added. */
export function scheduleForRetirement(retired: boolean): ScheduleStep[] {
  return SCHEDULE.filter((step) => step.kind !== "intraday").map((step) => (
    step.kind === "market-daily" && retired
      ? { ...step, description: "Stores today's daily candles, including NIFTY 50." }
      : step
  ));
}

export function minutesOf(clock: string): number {
  const [hour, minute] = clock.split(":").map(Number);
  return hour * 60 + (minute || 0);
}

export type StepRun = { status: string; finishedMinutes: number | null; count?: number; errors?: number };

export type StepMark = "done" | "late" | "failed" | "planned" | "next" | "skipped";

export function markStep(planned: string, run: StepRun | null): StepMark {
  if (!run) return "planned";
  if (run.status === "skipped") return "skipped";
  if (/fail|error/i.test(run.status)) return "failed";
  if (run.finishedMinutes != null && run.finishedMinutes > minutesOf(planned) + 20) return "late";
  return "done";
}

export function systemBanner(input: {
  closed: boolean;
  minutes: number;
  kiteConnected: boolean;
  failed: string | null;
  buysDone: boolean;
  clock: string;
  next: string;
}): { tone: "ok" | "wait" | "bad" | "muted"; line: string } {
  const tail = `${input.clock}. Next: ${input.next}.`;
  if (input.failed) return { tone: "bad", line: `Something failed: ${input.failed}. ${tail}` };
  if (input.closed) return { tone: "muted", line: `Market closed today. ${tail}` };
  if (input.minutes < 9 * 60 + 15 && !input.kiteConnected) return { tone: "wait", line: `Waiting for Kite login (buys held). ${tail}` };
  if (input.minutes < 9 * 60 + 15) return { tone: "ok", line: `Ready for the open. ${tail}` };
  if (input.minutes < 15 * 60 + 30 && input.buysDone) return { tone: "ok", line: `Market open: buys done, watching fills. ${tail}` };
  if (input.minutes < 15 * 60 + 30) return { tone: "ok", line: `Market open. ${tail}` };
  return { tone: "muted", line: `Market closed: evening jobs next. ${tail}` };
}

export function yesterdayLine(lateBuy: string | null, kiteAt: string | null, failed: string | null): string {
  if (failed) return `${failed} failed.`;
  if (lateBuy && kiteAt) return `All jobs ran. Buys ran late at ${lateBuy} because Kite was connected at ${kiteAt}.`;
  if (lateBuy) return `All jobs ran. Buys ran late at ${lateBuy}.`;
  return "All jobs ran.";
}

/** The earliest step that has not finished yet. A closed day (nowMinutes of 24h) stays as planned. */
export function withNext(marks: StepMark[], nowMinutes: number, times: string[]): StepMark[] {
  if (times.length !== marks.length) return marks;
  const next = nowMinutes < 24 * 60 ? marks.findIndex((mark) => mark === "planned") : -1;
  if (next < 0) return marks;
  return marks.map((mark, index) => (index === next ? "next" : mark));
}
