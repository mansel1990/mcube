import { gzipSync } from "zlib";
import path from "path";
import { mkdir, rename, unlink, writeFile, access } from "fs/promises";
import { addDays, istMinutes, todayIst } from "@/lib/mlive/calendar";
import { mq } from "../db";
import { MliveKite } from "../kite";
import { runJob } from "../run";

const SIZE_GATE = 650 * 1024 * 1024;
export const INSTRUMENT_BATCH = 500;
export const CANDLE_BATCH = 1000;
export const KITE_GAP_MS = 350;
export const KITE_BACKOFF_MS = [2000, 5000, 15000] as const;

const INDEXES = ["NIFTY 50", "NIFTY 500", "NIFTY BANK", "NIFTY IT", "NIFTY AUTO", "NIFTY PHARMA", "NIFTY FMCG", "NIFTY METAL", "NIFTY REALTY", "NIFTY ENERGY", "NIFTY INFRA", "NIFTY PSE", "NIFTY MEDIA", "NIFTY PSU BANK", "NIFTY FIN SERVICE"];

export type SeriesId = "daily" | "5m-neon" | "5m-files" | "1m-files";
export type CandleInterval = "day" | "5minute" | "minute";
export type StoreName = "neon" | "file";
export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export type DateChunk = { from: string; to: string; label: string };
export type InstrumentRow = { token: number; symbol: string; tick: number; type: string };
export type MarketArgs = { only?: string[]; series?: SeriesId };

type CandleTable = "candles_daily" | "candles_5m" | "candles_1m";

export type SeriesPlan = {
  id: SeriesId;
  label: string;
  interval: CandleInterval;
  store: StoreName;
  table: CandleTable | null;
  fileKind: "5m" | "1m" | null;
  where: "u.nifty500 = true" | "u.nifty200 = true" | "u.nifty100 = true";
  indexes: boolean;
  from: string;
  to: string;
  chunk: "span" | "month";
  span: number;
  barsPerDay: number | null;
};

let lastKiteAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSeriesId(value: string): value is SeriesId {
  return value === "daily" || value === "5m-neon" || value === "5m-files" || value === "1m-files";
}

export function parseMarketArgs(argv: string[]): MarketArgs {
  const only: string[] = [];
  let series: SeriesId | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--only" || arg.startsWith("--only=")) {
      const raw: string[] = [];
      if (arg.startsWith("--only=")) raw.push(arg.slice("--only=".length));
      else {
        i += 1;
        while (i < argv.length && !argv[i].startsWith("--")) {
          raw.push(argv[i]);
          i += 1;
        }
        i -= 1;
      }
      const text = raw.join(" ").trim();
      if (!text) throw new Error("--only needs at least one symbol");
      for (const piece of text.split(",")) {
        const symbol = piece.trim();
        if (symbol) only.push(symbol);
      }
    } else if (arg === "--series" || arg.startsWith("--series=")) {
      const value = arg.startsWith("--series=") ? arg.slice("--series=".length) : argv[++i];
      if (!value || value.startsWith("--") || !isSeriesId(value)) {
        throw new Error("--series needs daily, 5m-neon, 5m-files, or 1m-files");
      }
      series = value;
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }
  return { only: only.length ? only : undefined, series };
}

export function seriesPlans(end: string): SeriesPlan[] {
  return [
    {
      id: "daily",
      label: "daily",
      interval: "day",
      store: "neon",
      table: "candles_daily",
      fileKind: null,
      where: "u.nifty500 = true",
      indexes: true,
      from: "2015-01-01",
      to: end,
      chunk: "span",
      span: 1800,
      barsPerDay: null,
    },
    {
      id: "5m-neon",
      label: "5m neon",
      interval: "5minute",
      store: "neon",
      table: "candles_5m",
      fileKind: null,
      where: "u.nifty200 = true",
      indexes: false,
      from: addDays(end, -89),
      to: end,
      chunk: "span",
      span: 90,
      barsPerDay: 75,
    },
    {
      id: "5m-files",
      label: "5m files",
      interval: "5minute",
      store: "file",
      table: null,
      fileKind: "5m",
      where: "u.nifty200 = true",
      indexes: false,
      from: addDays(end, -730),
      to: end,
      chunk: "month",
      span: 31,
      barsPerDay: 75,
    },
    {
      id: "1m-files",
      label: "1m files",
      interval: "minute",
      store: "file",
      table: null,
      fileKind: "1m",
      where: "u.nifty100 = true",
      indexes: false,
      from: addDays(end, -365),
      to: end,
      chunk: "month",
      span: 31,
      barsPerDay: 375,
    },
  ];
}

function plansForRun(end: string, oneSession: boolean, series?: SeriesId): SeriesPlan[] {
  let plans = seriesPlans(end);
  if (oneSession) plans = plans.filter((plan) => plan.store === "neon").map((plan) => ({ ...plan, from: end, to: end }));
  if (series) plans = plans.filter((plan) => plan.id === series);
  return plans;
}

export function monthEnd(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** One inclusive calendar month per chunk. The first and last chunks can be partial. */
export function monthChunks(from: string, to: string): DateChunk[] {
  if (from > to) return [];
  const chunks: DateChunk[] = [];
  let cursor = from;
  while (cursor <= to) {
    const end = monthEnd(cursor);
    const capped = end < to ? end : to;
    chunks.push({ from: cursor, to: capped, label: cursor.slice(0, 7) });
    const next = addDays(capped, 1);
    if (next <= cursor) break;
    cursor = next;
  }
  return chunks;
}

/** Inclusive blocks of at most `span` days. */
export function spanChunks(from: string, to: string, span: number): DateChunk[] {
  if (from > to) return [];
  if (span < 1) throw new Error("span must be at least 1 day");
  const chunks: DateChunk[] = [];
  let cursor = from;
  while (cursor <= to) {
    const end = addDays(cursor, span - 1);
    const capped = end > to ? to : end;
    chunks.push({ from: cursor, to: capped, label: cursor.slice(0, 7) });
    const next = addDays(capped, 1);
    if (next <= cursor) break;
    cursor = next;
  }
  return chunks;
}

export function filesRoot(): string {
  return process.env.MARKET_FILES_DIR?.trim() || "/var/lib/mcube/candles";
}

export function monthFile(kind: "5m" | "1m", symbol: string, month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Bad candle month ${month}`);
  if (!symbol || /[\\/]/.test(symbol) || symbol.includes("..")) throw new Error(`Bad candle symbol ${symbol}`);
  return path.join(filesRoot(), kind, symbol, `${month}.csv.gz`);
}

export function istStamp(value: string): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00";
  const hour = part("hour") === "24" ? "00" : part("hour");
  return `${part("year")}-${part("month")}-${part("day")} ${hour}:${part("minute")}:${part("second")}`;
}

export function candleCsv(rows: Candle[]): string {
  const lines = ["ts_ist,open,high,low,close,volume"];
  for (const row of rows) lines.push(`${istStamp(row.date)},${row.open},${row.high},${row.low},${row.close},${row.volume}`);
  return `${lines.join("\n")}\n`;
}

export function keepInstrumentRows(rows: InstrumentRow[], universe: ReadonlySet<string>): InstrumentRow[] {
  const indexes = new Set<string>(INDEXES);
  const seen = new Set<string>();
  const kept: InstrumentRow[] = [];
  for (const row of rows) {
    if (!row.token || !row.symbol) continue;
    const index = indexes.has(row.symbol);
    if (!index && (row.type !== "EQ" || !universe.has(row.symbol))) continue;
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    kept.push(row);
  }
  return kept;
}

function statusOf(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    if (status) return status;
  }
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\b([45]\d\d)\b/);
  return match ? Number(match[1]) : 0;
}

function retryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function paceKite(): Promise<void> {
  if (!lastKiteAt) return;
  const wait = KITE_GAP_MS - (Date.now() - lastKiteAt);
  if (wait > 0) await sleep(wait);
}

async function kiteCall<T>(fn: () => Promise<T>): Promise<T> {
  await paceKite();
  try {
    return await fn();
  } finally {
    lastKiteAt = Date.now();
  }
}

function valuesClause(rows: unknown[][], width: number): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const sql = rows
    .map((row, index) => {
      const base = index * width;
      values.push(...row);
      return `(${Array.from({ length: width }, (_, column) => `$${base + column + 1}`).join(",")})`;
    })
    .join(",");
  return { sql, values };
}

async function insertBatched(build: (placeholders: string) => string, rows: unknown[][], width: number, batch: number): Promise<void> {
  for (let start = 0; start < rows.length; start += batch) {
    const slice = rows.slice(start, start + batch);
    const built = valuesClause(slice, width);
    await mq(build(built.sql), built.values);
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function writeMonthFile(kind: "5m" | "1m", symbol: string, month: string, rows: Candle[]): Promise<void> {
  const finalPath = monthFile(kind, symbol, month);
  await mkdir(path.dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.${process.pid}.tmp`;
  try {
    await writeFile(tmpPath, gzipSync(Buffer.from(candleCsv(rows))));
    await rename(tmpPath, finalPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => undefined);
    throw error;
  }
}

function candleDay(row: Candle, interval: CandleInterval): string {
  return interval === "day" ? row.date.slice(0, 10) : istStamp(row.date).slice(0, 10);
}

function prepareRows(rows: Candle[], interval: CandleInterval, from: string, to: string): Candle[] {
  return rows
    .filter((row) => {
      const day = candleDay(row, interval);
      return day >= from && day <= to;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function ensureSchema(): Promise<void> {
  await mq(`CREATE TABLE IF NOT EXISTS instruments (
    token bigint PRIMARY KEY,
    symbol text NOT NULL,
    tick numeric NOT NULL,
    kind text NOT NULL
  )`);
  await mq(`CREATE TABLE IF NOT EXISTS candles_daily (
    token bigint NOT NULL,
    symbol text NOT NULL,
    ts date NOT NULL,
    open numeric NOT NULL,
    high numeric NOT NULL,
    low numeric NOT NULL,
    close numeric NOT NULL,
    volume bigint NOT NULL,
    PRIMARY KEY (token, ts)
  )`);
  await mq(`CREATE TABLE IF NOT EXISTS candles_5m (
    token bigint NOT NULL,
    symbol text NOT NULL,
    ts timestamptz NOT NULL,
    open numeric NOT NULL,
    high numeric NOT NULL,
    low numeric NOT NULL,
    close numeric NOT NULL,
    volume bigint NOT NULL,
    PRIMARY KEY (token, ts)
  )`);
  await mq(`CREATE TABLE IF NOT EXISTS candles_1m (
    token bigint NOT NULL,
    symbol text NOT NULL,
    ts timestamptz NOT NULL,
    open numeric NOT NULL,
    high numeric NOT NULL,
    low numeric NOT NULL,
    close numeric NOT NULL,
    volume bigint NOT NULL,
    PRIMARY KEY (token, ts)
  )`);
  await mq(`CREATE TABLE IF NOT EXISTS download_progress (
    symbol text NOT NULL,
    interval text NOT NULL,
    store text NOT NULL DEFAULT 'neon',
    last_to date,
    PRIMARY KEY (symbol, interval, store)
  )`);
  await mq(`ALTER TABLE download_progress ADD COLUMN IF NOT EXISTS store text`);
  await mq(`UPDATE download_progress SET store = 'neon' WHERE store IS NULL`);
  await mq(`ALTER TABLE download_progress ALTER COLUMN store SET DEFAULT 'neon'`);
  await mq(`ALTER TABLE download_progress ALTER COLUMN store SET NOT NULL`);
  const keys = await mq<{ definition: string }>(
    `SELECT pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conrelid = 'download_progress'::regclass AND contype = 'p'`
  );
  if (!keys.some((row) => String(row.definition ?? "").includes("store"))) {
    await mq(`ALTER TABLE download_progress DROP CONSTRAINT IF EXISTS download_progress_pkey`);
    await mq(`ALTER TABLE download_progress ADD PRIMARY KEY (symbol, interval, store)`);
  }
  await mq(`CREATE TABLE IF NOT EXISTS universe (
    symbol text PRIMARY KEY,
    nifty500 boolean NOT NULL DEFAULT false,
    nifty200 boolean NOT NULL DEFAULT false,
    nifty100 boolean NOT NULL DEFAULT false
  )`);
}

async function databaseBytes(): Promise<number> {
  const rows = await mq<{ bytes: string }>(`SELECT pg_database_size(current_database())::text AS bytes`);
  return Number(rows[0]?.bytes ?? 0);
}

async function niftySymbols(file: string): Promise<string[]> {
  const response = await fetch(`https://archives.nseindia.com/content/indices/${file}`);
  if (!response.ok) throw new Error(`Nifty list ${file} returned ${response.status}`);
  const text = await response.text();
  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",")[2]?.replace(/"/g, "").trim())
    .filter((symbol): symbol is string => Boolean(symbol) && symbol !== "Symbol");
}

async function loadUniverse(): Promise<Set<string>> {
  const [n500, n200, n100] = await Promise.all([
    niftySymbols("ind_nifty500list.csv"),
    niftySymbols("ind_nifty200list.csv"),
    niftySymbols("ind_nifty100list.csv"),
  ]);
  const flags = new Map<string, { n500: boolean; n200: boolean; n100: boolean }>();
  for (const symbol of n500) flags.set(symbol, { n500: true, n200: false, n100: false });
  for (const symbol of n200) flags.set(symbol, { ...(flags.get(symbol) ?? { n500: false, n200: false, n100: false }), n200: true });
  for (const symbol of n100) flags.set(symbol, { ...(flags.get(symbol) ?? { n500: false, n200: false, n100: false }), n100: true });
  const rows = [...flags.entries()].map(([symbol, row]) => [symbol, row.n500, row.n200, row.n100]);
  await insertBatched(
    (placeholders) =>
      `INSERT INTO universe (symbol, nifty500, nifty200, nifty100) VALUES ${placeholders}
       ON CONFLICT (symbol) DO UPDATE SET nifty500 = EXCLUDED.nifty500, nifty200 = EXCLUDED.nifty200, nifty100 = EXCLUDED.nifty100`,
    rows,
    4,
    INSTRUMENT_BATCH
  );
  return new Set(flags.keys());
}

async function refreshInstruments(kite: MliveKite, universe: ReadonlySet<string>): Promise<void> {
  const rows = await kiteCall(() => kite.instruments());
  const kept = keepInstrumentRows(rows, universe);
  console.log(`instruments: ${kept.length} kept of ${rows.length}`);
  await insertBatched(
    (placeholders) =>
      `INSERT INTO instruments (token, symbol, tick, kind) VALUES ${placeholders}
       ON CONFLICT (token) DO UPDATE SET symbol = EXCLUDED.symbol, tick = EXCLUDED.tick, kind = EXCLUDED.kind`,
    kept.map((row) => [row.token, row.symbol, row.tick || 0.05, row.type]),
    4,
    INSTRUMENT_BATCH
  );
}

export async function symbolsFor(plan: SeriesPlan, only?: string[]): Promise<Array<{ token: number; symbol: string }>> {
  const rows = await mq<{ token: string; symbol: string }>(
    `SELECT i.token::text AS token, i.symbol
     FROM instruments i
     JOIN universe u ON u.symbol = i.symbol
     WHERE ${plan.where}
     ORDER BY i.symbol`
  );
  if (plan.indexes) {
    const indexes = await mq<{ token: string; symbol: string }>(
      `SELECT token::text AS token, symbol FROM instruments WHERE symbol = ANY($1::text[])`,
      [INDEXES]
    );
    rows.push(...indexes);
  }
  const bySymbol = new Map<string, { token: number; symbol: string }>();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, { token: Number(row.token), symbol: row.symbol });
  }
  let list = [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (only?.length) {
    const wanted = new Set(only);
    list = list.filter((row) => wanted.has(row.symbol));
  }
  return list;
}

async function fetchChunk(kite: MliveKite, token: number, interval: CandleInterval, from: string, to: string): Promise<Candle[]> {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= KITE_BACKOFF_MS.length; attempt++) {
    try {
      const rows = await kiteCall(() => kite.historical(token, interval, `${from} 00:00:00`, `${to} 23:59:59`));
      return rows ?? [];
    } catch (error) {
      const status = statusOf(error);
      if (status === 403) throw new Error("Kite session expired. The morning login has ended, so this run stops.");
      if (!retryable(status)) throw error;
      lastStatus = status;
      if (attempt === KITE_BACKOFF_MS.length) break;
      await sleep(KITE_BACKOFF_MS[attempt]);
    }
  }
  throw new Error(`Kite ${lastStatus} after four tries. Progress was not moved.`);
}

async function insertCandles(table: CandleTable, token: number, symbol: string, rows: Candle[]): Promise<void> {
  const values = rows.map((row) => [token, symbol, row.date, row.open, row.high, row.low, row.close, row.volume]);
  await insertBatched(
    (placeholders) =>
      `INSERT INTO ${table} (token, symbol, ts, open, high, low, close, volume) VALUES ${placeholders}
       ON CONFLICT (token, ts) DO NOTHING`,
    values,
    8,
    CANDLE_BATCH
  );
}

async function saveProgress(symbol: string, plan: SeriesPlan, lastTo: string): Promise<void> {
  await mq(
    `INSERT INTO download_progress (symbol, interval, store, last_to) VALUES ($1, $2, $3, $4)
     ON CONFLICT (symbol, interval, store) DO UPDATE SET last_to = EXCLUDED.last_to`,
    [symbol, plan.interval, plan.store, lastTo]
  );
}

async function sessionLoaded(table: CandleTable, token: number, day: string): Promise<boolean> {
  const dayExpr = table === "candles_daily" ? "ts = $2::date" : "(ts AT TIME ZONE 'Asia/Kolkata')::date = $2::date";
  const have = await mq<{ n: string }>(`SELECT count(*)::text AS n FROM ${table} WHERE token = $1 AND ${dayExpr}`, [token, day]);
  return Number(have[0]?.n ?? 0) > 0;
}

async function runSeries(kite: MliveKite, plan: SeriesPlan, only: string[] | undefined, oneSession: boolean): Promise<void> {
  const symbols = await symbolsFor(plan, only);
  if (symbols.length === 0) {
    console.log(`${plan.label}: no symbols`);
    return;
  }
  console.log(`${plan.label}: ${symbols.length} symbols ${plan.from} to ${plan.to}`);
  let finished = 0;
  for (const item of symbols) {
    if (plan.store === "neon" && (await databaseBytes()) >= SIZE_GATE) {
      console.log(`market: stopped before 650 MB while on ${plan.label}. Unfinished symbols stay in download_progress.`);
      return;
    }
    const progress = await mq<{ last_to: string | null }>(
      `SELECT last_to::text AS last_to FROM download_progress WHERE symbol = $1 AND interval = $2 AND store = $3`,
      [item.symbol, plan.interval, plan.store]
    );
    const cursor = progress[0]?.last_to ? addDays(progress[0].last_to.slice(0, 10), 1) : plan.from;
    if (cursor > plan.to) {
      finished += 1;
      console.log(`${plan.label} ${finished} of ${symbols.length}`);
      continue;
    }
    if (oneSession && plan.table && (await sessionLoaded(plan.table, item.token, plan.to))) {
      await saveProgress(item.symbol, plan, plan.to);
      finished += 1;
      console.log(`${plan.label} ${finished} of ${symbols.length}`);
      continue;
    }
    const chunks = plan.chunk === "month" ? monthChunks(cursor, plan.to) : spanChunks(cursor, plan.to, plan.span);
    for (const chunk of chunks) {
      if (plan.fileKind) {
        const file = monthFile(plan.fileKind, item.symbol, chunk.label);
        if (await fileExists(file)) {
          await saveProgress(item.symbol, plan, chunk.to);
          continue;
        }
      }
      const rows = prepareRows(await fetchChunk(kite, item.token, plan.interval, chunk.from, chunk.to), plan.interval, chunk.from, chunk.to);
      if (plan.store === "neon" && plan.table) await insertCandles(plan.table, item.token, item.symbol, rows);
      else if (plan.fileKind) await writeMonthFile(plan.fileKind, item.symbol, chunk.label, rows);
      await saveProgress(item.symbol, plan, chunk.to);
    }
    finished += 1;
    console.log(`${plan.label} ${finished} of ${symbols.length}`);
  }
}

async function run(options: { oneSession: boolean; only?: string[]; series?: SeriesId }): Promise<void> {
  const minutes = istMinutes();
  if (minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30) throw new Error("Market data does not run between 09:15 and 15:30 IST.");
  await ensureSchema();
  const kite = new MliveKite(false);
  const universe = await loadUniverse();
  await refreshInstruments(kite, universe);
  const end = todayIst();
  const plans = plansForRun(end, options.oneSession, options.series);
  if (plans.length === 0) throw new Error("--series did not match a download");
  for (const plan of plans) await runSeries(kite, plan, options.only, options.oneSession);
  console.log(options.oneSession ? "market-daily finished" : "market-backfill finished");
}

export async function marketBackfill(args: MarketArgs = {}): Promise<void> {
  await runJob("market-backfill", async () => {
    await run({ oneSession: false, only: args.only, series: args.series });
    return { job: "market-backfill", only: args.only ?? null, series: args.series ?? "all" };
  });
}

export async function marketDaily(): Promise<void> {
  await runJob("market-daily", async () => {
    await run({ oneSession: true });
    return { job: "market-daily" };
  });
}
