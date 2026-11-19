import { benchmarkThrough, sliceWindow, type BenchmarkSlice } from "./benchmark";
import { todayIst } from "./calendar";
import { loadNiftyCloses } from "./nifty";
import type { NiftyReason } from "./nifty-reason";
import { sql } from "../sql";

export type BenchmarkPeriod = BenchmarkSlice & { id: string; label: string };

export type BenchmarkReport = {
  book: "all" | "swing" | "intraday";
  tooEarly: boolean;
  periods: BenchmarkPeriod[];
  niftyReason: NiftyReason | null;
  /** Last close in the comparison. The figures are end-of-day, not the live account. */
  through: string | null;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function monthsAgo(iso: string, months: number): string {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 - months, date)).toISOString().slice(0, 10);
}

export async function benchmarkReport(book: string, now = new Date()): Promise<BenchmarkReport> {
  const chosen = book === "swing" || book === "intraday" ? book : "all";
  if (chosen === "intraday") {
    return { book: chosen, tooEarly: true, periods: emptyPeriods(), niftyReason: null, through: null };
  }
  const today = todayIst(now);
  const equity = await sql`SELECT trade_date::text AS trade_date, system_value FROM mlive.mlive_equity_daily ORDER BY trade_date`;
  const flows = await sql`SELECT (timezone('Asia/Kolkata', ts))::date::text AS d, kind, amount FROM mlive.mlive_fund_ledger WHERE kind IN ('deposit', 'withdrawal')`;
  const first = equity[0] ? String(equity[0].trade_date).slice(0, 10) : today;
  const nifty = await loadNiftyCloses(first);
  const closes = nifty.closes;
  const values = equity.map((row) => ({ date: String(row.trade_date).slice(0, 10), value: num(row.system_value) }));
  const cash = flows.map((row) => ({
    date: String(row.d).slice(0, 10),
    deposit: row.kind === "deposit" ? num(row.amount) : 0,
    withdrawal: row.kind === "withdrawal" ? num(row.amount) : 0,
  }));
  const windows: [string, string, string | null][] = [
    ["start", "Since start", null],
    ["month", "This month", `${today.slice(0, 7)}-01`],
    ["3m", "3M", monthsAgo(today, 3)],
    ["1y", "1Y", monthsAgo(today, 12)],
  ];
  const periods = windows.map(([id, label, from]) => ({ id, label, ...sliceWindow(values, cash, closes, from) }));
  const history = periods[0]?.marketDays ?? 0;
  return { book: chosen, tooEarly: history < 60, periods, niftyReason: nifty.reason, through: benchmarkThrough(values, closes) };
}

function emptyPeriods(): BenchmarkPeriod[] {
  const blank: BenchmarkSlice = { oursPct: null, niftyPct: null, diffPp: null, gainInr: null, daysAhead: 0, marketDays: 0 };
  return [
    { id: "start", label: "Since start", ...blank },
    { id: "month", label: "This month", ...blank },
    { id: "3m", label: "3M", ...blank },
    { id: "1y", label: "1Y", ...blank },
  ];
}

