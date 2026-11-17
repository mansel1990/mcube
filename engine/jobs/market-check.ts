import path from "path";
import { gunzipSync } from "zlib";
import { readdir, readFile, stat } from "fs/promises";
import { todayIst } from "@/lib/mlive/calendar";
import { mq } from "../db";
import { runJob } from "../run";
import { filesRoot, monthChunks, monthFile, seriesPlans, symbolsFor, type SeriesId, type SeriesPlan } from "./market";

const COVERAGE = 0.95;

type ShortDay = { symbol: string; day: string; bars: number };
type SeriesReport = {
  id: SeriesId;
  label: string;
  expected: number;
  present: number;
  rows: number;
  first: string | null;
  last: string | null;
  missing: string[];
  late: Array<{ symbol: string; first: string; expected: string }>;
  shortDays: { count: number; worst: ShortDay[] } | null;
};
type CloseRow = { symbol: string; day: string; five: number; daily: number; gap: number; flagged: boolean };
type MarketCheckReport = {
  series: SeriesReport[];
  calendarDays: number;
  missingSessions: { count: number; symbols: Array<{ symbol: string; missing: number; sample: string[] }> };
  closeCheck: CloseRow[];
  databaseBytes: number;
  filesBytes: number;
  passed: boolean;
};

function asText(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asText(item)).filter(Boolean);
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => asText(item.replace(/^"|"$/g, "")))
      .filter(Boolean);
  }
  return [];
}

function noteShort(worst: ShortDay[], count: { n: number }, row: ShortDay): void {
  count.n += 1;
  worst.push(row);
  worst.sort((a, b) => a.bars - b.bars || a.symbol.localeCompare(b.symbol) || a.day.localeCompare(b.day));
  if (worst.length > 10) worst.length = 10;
}

function shortFromCounts(
  symbol: string,
  counts: Map<string, number>,
  calendar: string[],
  expectedBars: number,
  worst: ShortDay[],
  count: { n: number }
): void {
  const days = [...counts.keys()].sort();
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return;
  const seen = new Set<string>();
  for (const day of calendar) {
    if (day < first || day > last) continue;
    seen.add(day);
    const bars = counts.get(day) ?? 0;
    if (bars !== expectedBars) noteShort(worst, count, { symbol, day, bars });
  }
  if (calendar.length === 0) {
    for (const [day, bars] of counts) {
      if (bars !== expectedBars) noteShort(worst, count, { symbol, day, bars });
    }
  } else {
    for (const [day, bars] of counts) {
      if (seen.has(day)) continue;
      if (bars !== expectedBars) noteShort(worst, count, { symbol, day, bars });
    }
  }
}

async function directoryBytes(root: string): Promise<number> {
  let total = 0;
  const pending = [root];
  while (pending.length) {
    const dir = pending.pop();
    if (!dir) break;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) total += (await stat(full)).size;
    }
  }
  return total;
}

async function niftyCalendar(): Promise<string[]> {
  const rows = await mq<{ day: string }>(`SELECT ts::text AS day FROM candles_daily WHERE symbol = 'NIFTY 50' ORDER BY ts`);
  return rows.map((row) => asText(row.day));
}

async function dailyReport(plan: SeriesPlan, names: string[], calendar: string[]): Promise<SeriesReport> {
  const grouped = new Map<string, { first: string; last: string; rows: number }>();
  if (names.length) {
    const rows = await mq<{ symbol: string; first: string; last: string; rows: string }>(
      `SELECT symbol, min(ts)::text AS first, max(ts)::text AS last, count(*)::text AS rows
       FROM candles_daily WHERE symbol = ANY($1::text[]) GROUP BY symbol`,
      [names]
    );
    for (const row of rows) grouped.set(row.symbol, { first: asText(row.first), last: asText(row.last), rows: Number(row.rows) });
  }
  return finishReport(plan, names, grouped, calendar, null, new Map());
}

async function neonIntradayReport(plan: SeriesPlan, names: string[], calendar: string[]): Promise<SeriesReport> {
  const counts = new Map<string, Map<string, number>>();
  if (names.length && plan.table) {
    const rows = await mq<{ symbol: string; day: string; bars: number }>(
      `SELECT symbol, (ts AT TIME ZONE 'Asia/Kolkata')::date::text AS day, count(*)::int AS bars
       FROM ${plan.table}
       WHERE symbol = ANY($1::text[])
         AND ts >= ($2::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND ts < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND (ts AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date
       GROUP BY symbol, (ts AT TIME ZONE 'Asia/Kolkata')::date`,
      [names, plan.from, plan.to]
    );
    for (const row of rows) {
      const book = counts.get(row.symbol) ?? new Map<string, number>();
      book.set(asText(row.day), Number(row.bars));
      counts.set(row.symbol, book);
    }
  }
  const grouped = new Map<string, { first: string; last: string; rows: number }>();
  for (const [symbol, book] of counts) {
    const days = [...book.keys()].sort();
    const rows = [...book.values()].reduce((sum, bars) => sum + bars, 0);
    if (days[0] && days[days.length - 1]) grouped.set(symbol, { first: days[0], last: days[days.length - 1], rows });
  }
  return finishReport(plan, names, grouped, calendar, plan.barsPerDay, counts);
}

async function fileReport(plan: SeriesPlan, names: string[], calendar: string[]): Promise<SeriesReport> {
  const grouped = new Map<string, { first: string; last: string; rows: number }>();
  const counts = new Map<string, Map<string, number>>();
  const months = monthChunks(plan.from, plan.to).map((chunk) => chunk.label);
  if (plan.fileKind) {
    for (const symbol of names) {
      const book = new Map<string, number>();
      for (const month of months) {
        const file = monthFile(plan.fileKind, symbol, month);
        let text = "";
        try {
          text = gunzipSync(await readFile(file)).toString("utf8");
        } catch {
          continue;
        }
        for (const line of text.split(/\r?\n/)) {
          if (!line || line.startsWith("ts_ist")) continue;
          const day = line.slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
          book.set(day, (book.get(day) ?? 0) + 1);
        }
      }
      if (book.size === 0) continue;
      counts.set(symbol, book);
      const days = [...book.keys()].sort();
      const rows = [...book.values()].reduce((sum, bars) => sum + bars, 0);
      if (days[0] && days[days.length - 1]) grouped.set(symbol, { first: days[0], last: days[days.length - 1], rows });
    }
  }
  return finishReport(plan, names, grouped, calendar, plan.barsPerDay, counts);
}

function finishReport(
  plan: SeriesPlan,
  names: string[],
  grouped: Map<string, { first: string; last: string; rows: number }>,
  calendar: string[],
  barsPerDay: number | null,
  counts: Map<string, Map<string, number>>
): SeriesReport {
  const window = calendar.filter((day) => day >= plan.from && day <= plan.to);
  const expectedStart = window[0] ?? null;
  const missing: string[] = [];
  const late: SeriesReport["late"] = [];
  let rows = 0;
  let first: string | null = null;
  let last: string | null = null;
  const worst: ShortDay[] = [];
  const shortCount = { n: 0 };
  for (const symbol of names) {
    const found = grouped.get(symbol);
    if (!found) {
      missing.push(symbol);
      continue;
    }
    rows += found.rows;
    if (!first || found.first < first) first = found.first;
    if (!last || found.last > last) last = found.last;
    if (expectedStart && found.first > expectedStart) late.push({ symbol, first: found.first, expected: expectedStart });
    if (barsPerDay) shortFromCounts(symbol, counts.get(symbol) ?? new Map(), window, barsPerDay, worst, shortCount);
  }
  return {
    id: plan.id,
    label: plan.label,
    expected: names.length,
    present: names.length - missing.length,
    rows,
    first,
    last,
    missing,
    late,
    shortDays: barsPerDay ? { count: shortCount.n, worst } : null,
  };
}

async function missingSessions(names: string[]): Promise<MarketCheckReport["missingSessions"]> {
  if (names.length === 0) return { count: 0, symbols: [] };
  const rows = await mq<{ symbol: string; missing: number; sample: unknown }>(
    `WITH calendar AS (
       SELECT ts FROM candles_daily WHERE symbol = 'NIFTY 50'
     ),
     bounds AS (
       SELECT symbol, min(ts) AS first_ts, max(ts) AS last_ts
       FROM candles_daily
       WHERE symbol = ANY($1::text[])
       GROUP BY symbol
     )
     SELECT b.symbol,
            count(*)::int AS missing,
            (array_agg(c.ts::text ORDER BY c.ts))[1:5] AS sample
     FROM bounds b
     JOIN calendar c ON c.ts BETWEEN b.first_ts AND b.last_ts
     LEFT JOIN candles_daily d ON d.symbol = b.symbol AND d.ts = c.ts
     WHERE d.ts IS NULL AND b.symbol <> 'NIFTY 50'
     GROUP BY b.symbol
     ORDER BY missing DESC, b.symbol`,
    [names]
  );
  const symbols = rows.map((row) => ({ symbol: row.symbol, missing: Number(row.missing), sample: asStrings(row.sample) }));
  return { count: symbols.reduce((sum, row) => sum + row.missing, 0), symbols };
}

async function closeCheck(from: string, to: string): Promise<CloseRow[]> {
  const rows = await mq<{ symbol: string; day: string; five: string; daily: string }>(
    `WITH last5 AS (
       SELECT DISTINCT ON (symbol, (ts AT TIME ZONE 'Asia/Kolkata')::date)
         symbol,
         (ts AT TIME ZONE 'Asia/Kolkata')::date AS day,
         close AS five
       FROM candles_5m
       WHERE ts >= ($1::timestamp AT TIME ZONE 'Asia/Kolkata')
         AND ts < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
       ORDER BY symbol, (ts AT TIME ZONE 'Asia/Kolkata')::date, ts DESC
     )
     SELECT l.symbol, l.day::text AS day, l.five::text AS five, d.close::text AS daily
     FROM last5 l
     JOIN candles_daily d ON d.symbol = l.symbol AND d.ts = l.day
     ORDER BY random()
     LIMIT 20`,
    [from, to]
  );
  return rows.map((row) => {
    const five = Number(row.five);
    const daily = Number(row.daily);
    const gap = daily ? Math.abs(five - daily) / Math.abs(daily) : 0;
    return { symbol: row.symbol, day: asText(row.day), five, daily, gap: Math.round(gap * 1e6) / 1e6, flagged: gap > 0.005 };
  });
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printReport(report: MarketCheckReport): void {
  for (const series of report.series) {
    const share = series.expected ? `${series.present} of ${series.expected}` : "0 of 0";
    console.log(`${series.label}: ${share} stocks, ${series.rows} rows, ${series.first ?? "none"} to ${series.last ?? "none"}`);
    if (series.missing.length) console.log(`  no data: ${series.missing.join(", ")}`);
    if (series.late.length) {
      console.log(`  first date late: ${series.late.length}`);
      for (const row of series.late) console.log(`  ${row.symbol} ${row.first} (expected ${row.expected})`);
    }
    if (series.shortDays) {
      const worst = series.shortDays.worst.map((row) => `${row.symbol} ${row.day} ${row.bars}`).join(", ");
      console.log(`  short days: ${series.shortDays.count}; worst: ${worst || "none"}`);
    }
  }
  console.log(`NIFTY 50 calendar: ${report.calendarDays} sessions`);
  console.log(`sessions missing after each stock's first candle, vs NIFTY 50: ${report.missingSessions.count} across ${report.missingSessions.symbols.length} stocks`);
  for (const row of report.missingSessions.symbols) {
    console.log(`  ${row.symbol}: ${row.missing} (${row.sample.join(", ")})`);
  }
  const flagged = report.closeCheck.filter((row) => row.flagged);
  console.log(`5-minute close vs daily: ${report.closeCheck.length} checked, ${flagged.length} over 0.5%`);
  for (const row of flagged) console.log(`  ${row.symbol} ${row.day} five ${row.five} daily ${row.daily} ${(row.gap * 100).toFixed(2)}%`);
  console.log(`market database ${megabytes(report.databaseBytes)}, files ${megabytes(report.filesBytes)}`);
  if (!report.passed) console.log("market-check failed: a series has under 95% of its expected stocks");
}

async function check(): Promise<MarketCheckReport> {
  const end = todayIst();
  const plans = seriesPlans(end);
  const calendar = await niftyCalendar();
  const series: SeriesReport[] = [];
  let dailyNames: string[] = [];
  for (const plan of plans) {
    const names = (await symbolsFor(plan)).map((row) => row.symbol);
    if (plan.id === "daily") dailyNames = names;
    if (plan.id === "daily") series.push(await dailyReport(plan, names, calendar));
    else if (plan.store === "neon") series.push(await neonIntradayReport(plan, names, calendar));
    else series.push(await fileReport(plan, names, calendar));
  }
  const fiveNeon = plans.find((plan) => plan.id === "5m-neon");
  const [sessions, closes, databaseBytes, filesBytes] = await Promise.all([
    missingSessions(dailyNames),
    closeCheck(fiveNeon?.from ?? end, fiveNeon?.to ?? end),
    mq<{ bytes: string }>(`SELECT pg_database_size(current_database())::text AS bytes`).then((rows) => Number(rows[0]?.bytes ?? 0)),
    directoryBytes(filesRoot()),
  ]);
  const passed = series.every((row) => row.expected === 0 || row.present / row.expected >= COVERAGE);
  return { series, calendarDays: calendar.length, missingSessions: sessions, closeCheck: closes, databaseBytes, filesBytes, passed };
}

export async function marketCheck(): Promise<void> {
  await runJob("market-check", async () => {
    const report = await check();
    printReport(report);
    if (!report.passed) process.exitCode = 1;
    return {
      series: report.series,
      calendarDays: report.calendarDays,
      missingSessions: report.missingSessions,
      closeCheck: report.closeCheck,
      databaseBytes: report.databaseBytes,
      filesBytes: report.filesBytes,
      passed: report.passed,
    };
  });
}
