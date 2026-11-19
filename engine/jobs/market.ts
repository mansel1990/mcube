import path from "path";
import { createReadStream } from "fs";
import { mkdir, readdir, readFile, rename, statfs, unlink, writeFile, access } from "fs/promises";
import { createInterface } from "readline";
import { createGunzip, gunzipSync, gzipSync } from "zlib";
import { addDays, istMinutes, previousTradingDay, todayIst } from "@/lib/mlive/calendar";
import { INTRADAY_BUILDING_END, INTRADAY_BUILDING_FROM } from "@/lib/mlive/research-bar";
import { LONG_GAME_INSTRUMENT_SYMBOLS, longGameEtfSymbols, longtermDailyFrom } from "@/lib/mlive/long-game-symbols";
import { mq, q } from "../db";
import { MliveKite } from "../kite";
import { holidaySet, loadSettings } from "../load";
import { runJob } from "../run";
import {
  assertFreeDisk,
  formatMinuteBackfillLine,
  formatMinuteCoverage,
  minuteImportMayStart,
  minuteImportMustStop,
  minuteProvenance,
  missingSessions,
  type SymbolCoverage,
} from "./market-window";

const SIZE_GATE = 650 * 1024 * 1024;
export const INSTRUMENT_BATCH = 500;
export const CANDLE_BATCH = 1000;
export const KITE_GAP_MS = 350;
export const KITE_BACKOFF_MS = [2000, 5000, 15000] as const;

const INDEXES = ["NIFTY 50", "NIFTY 500", "NIFTY BANK", "NIFTY IT", "NIFTY AUTO", "NIFTY PHARMA", "NIFTY FMCG", "NIFTY METAL", "NIFTY REALTY", "NIFTY ENERGY", "NIFTY INFRA", "NIFTY PSE", "NIFTY MEDIA", "NIFTY PSU BANK", "NIFTY FIN SERVICE"];

export type SeriesId = "daily" | "5m-neon" | "5m-files" | "1m-files" | "longterm-daily";
export type CandleInterval = "day" | "5minute" | "minute";
export type StoreName = "neon" | "file";
export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export type DateChunk = { from: string; to: string; label: string };
export type InstrumentRow = { token: number; symbol: string; tick: number; type: string };
export type MarketArgs = { only?: string[]; series?: SeriesId; refetchGaps?: boolean };

type CandleTable = "candles_daily" | "candles_5m" | "candles_1m";

export type SeriesPlan = {
  id: SeriesId;
  label: string;
  interval: CandleInterval;
  store: StoreName;
  table: CandleTable | null;
  fileKind: "5m" | "1m" | null;
  where: "u.nifty500 = true" | "u.nifty200 = true" | "u.nifty100 = true" | "longterm";
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
  return value === "daily" || value === "5m-neon" || value === "5m-files" || value === "1m-files" || value === "longterm-daily";
}

export function parseMarketArgs(argv: string[]): MarketArgs {
  const only: string[] = [];
  let series: SeriesId | undefined;
  let refetchGaps = false;
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
        throw new Error("--series needs daily, 5m-neon, 5m-files, 1m-files, or longterm-daily");
      }
      series = value;
    } else if (arg === "--refetch-gaps") {
      refetchGaps = true;
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }
  return { only: only.length ? only : undefined, series, ...(refetchGaps ? { refetchGaps: true } : {}) };
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
      // The VWAP building sample starts here; a shorter rolling window makes
      // missing early files look like flat, no-trade history in research.
      from: "2024-11-18",
      to: end,
      chunk: "month",
      span: 31,
      barsPerDay: 375,
    },
  ];
}

/** Daily candles for the Long Game ETFs. They are not Nifty 500 members and they are not an intraday plan. */
export function longtermDailyPlan(end: string, from = "2026-03-01"): SeriesPlan {
  return {
    id: "longterm-daily",
    label: "longterm daily",
    interval: "day",
    store: "neon",
    table: "candles_daily",
    fileKind: null,
    where: "longterm",
    indexes: false,
    from,
    to: end,
    chunk: "span",
    span: 1800,
    barsPerDay: null,
  };
}

/** Daily job series. Retired Intraday keeps daily candles and drops the 5-minute plan. */
export function dailyCandlePlanIds(retired: boolean): SeriesId[] {
  return retired ? ["daily"] : ["daily", "5m-neon"];
}

/** Swing daily plans plus the Long Game daily group. Core does not have to be enabled. */
export function dailyMarketPlanIds(retired: boolean): SeriesId[] {
  return [...dailyCandlePlanIds(retired), "longterm-daily"];
}

function plansForRun(end: string, oneSession: boolean, series?: SeriesId, sessionFrom = end): SeriesPlan[] {
  if (series === "longterm-daily") {
    const plan = longtermDailyPlan(end);
    return [{ ...plan, from: oneSession && sessionFrom > plan.from ? sessionFrom : plan.from, to: end }];
  }
  let plans = seriesPlans(end);
  if (oneSession) {
    plans = plans.filter((plan) => plan.store === "neon").map((plan) => ({
      ...plan,
      // Keep each series inside its own window. A long gap still fills every day that series stores.
      from: sessionFrom > plan.from ? sessionFrom : plan.from,
      to: end,
    }));
  }
  if (series) plans = plans.filter((plan) => plan.id === series);
  return plans;
}

/** Day the evening job should start. A gap begins the day after the newest stored daily candle. */
export function catchupFrom(end: string, lastStored: string | null, previous: string): string {
  if (!lastStored || lastStored >= previous) return end;
  const next = addDays(lastStored, 1);
  return next < end ? next : end;
}

async function sessionStart(end: string): Promise<string> {
  const holidays = await holidaySet();
  const previous = previousTradingDay(end, holidays);
  const rows = await mq<{ ts: string | null }>(`SELECT max(ts)::text AS ts FROM candles_daily`);
  const last = rows[0]?.ts ? String(rows[0].ts).slice(0, 10) : null;
  return catchupFrom(end, last, previous);
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

/**
 * One-minute requests for sessions missing from the stored month files.
 * `progressLastTo` is the forward download marker. It is not a cursor: a value
 * past 30 April 2026 must not skip the building gap, and this function does not
 * move that marker. Nothing after the building end is requested. Contiguous
 * missing sessions are split so each request is at most `span` calendar days.
 */
export function planMinuteBackfill(input: {
  progressLastTo: string | null;
  present: ReadonlySet<string>;
  calendar: readonly string[];
  span: number;
}): DateChunk[] {
  const start = INTRADAY_BUILDING_FROM;
  const end = INTRADAY_BUILDING_END;
  const forwardMarker = input.progressLastTo;
  const window = input.calendar.filter((day) => {
    if (forwardMarker && day > end) return false;
    return day >= start && day <= end;
  });
  const missing = window.filter((day) => !input.present.has(day));
  const chunks: DateChunk[] = [];
  for (const range of groupSessionRanges(missing, window)) {
    if (range.from > end || range.to > end) continue;
    const boundedTo = range.to > end ? end : range.to;
    const boundedFrom = range.from < start ? start : range.from;
    chunks.push(...spanChunks(boundedFrom, boundedTo, input.span).filter((chunk) => chunk.from >= start && chunk.to <= end));
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

export function keepInstrumentRows(rows: InstrumentRow[], universe: ReadonlySet<string>, extras: ReadonlySet<string> = new Set()): InstrumentRow[] {
  const indexes = new Set<string>(INDEXES);
  const seen = new Set<string>();
  const kept: InstrumentRow[] = [];
  for (const row of rows) {
    if (!row.token || !row.symbol) continue;
    const index = indexes.has(row.symbol);
    const extra = extras.has(row.symbol);
    if (!index && !extra && (row.type !== "EQ" || !universe.has(row.symbol))) continue;
    if (!index && extra && row.type !== "EQ") continue;
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
  const csv = candleCsv(rows);
  const tmpPath = `${finalPath}.${process.pid}.tmp`;
  try {
    await writeFile(tmpPath, gzipSync(Buffer.from(csv)));
    await rename(tmpPath, finalPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => undefined);
    throw error;
  }
  if (kind !== "1m") return;
  const sidecar = `${finalPath}.provenance.json`;
  if (await fileExists(sidecar)) return;
  const from = rows[0] ? istStamp(rows[0].date).slice(0, 10) : `${month}-01`;
  const last = rows.at(-1);
  const to = last ? istStamp(last.date).slice(0, 10) : from;
  await writeFile(sidecar, `${JSON.stringify(minuteProvenance({
    symbol,
    month,
    from,
    to,
    rows: rows.length,
    csv,
    retrievedAt: new Date().toISOString(),
  }))}\n`);
}

const MINUTE_HEADER = "ts_ist,open,high,low,close,volume";

/** Keep every stored session line. Incoming bars for a day already in the file are dropped. */
export function mergeMinuteCsv(existingCsv: string, incoming: readonly Candle[]): { csv: string; addedDays: string[] } {
  const stored = existingCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("ts_ist"));
  const storedDays = new Set(stored.map((line) => line.slice(0, 10)));
  const fresh = incoming.filter((row) => {
    const day = istStamp(row.date).slice(0, 10);
    return day >= INTRADAY_BUILDING_FROM && day <= INTRADAY_BUILDING_END && !storedDays.has(day);
  });
  const addedDays = [...new Set(fresh.map((row) => istStamp(row.date).slice(0, 10)))].sort();
  if (addedDays.length === 0) return { csv: existingCsv, addedDays };
  const addedLines = candleCsv([...fresh].sort((a, b) => a.date.localeCompare(b.date)))
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("ts_ist"));
  const body = [...stored, ...addedLines].sort((a, b) => a.localeCompare(b));
  return { csv: `${MINUTE_HEADER}\n${body.join("\n")}\n`, addedDays };
}

async function commitGzip(finalPath: string, body: Buffer): Promise<void> {
  await mkdir(path.dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, body);
  try {
    await rename(tmpPath, finalPath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code !== "EPERM" && code !== "EEXIST") {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
    await unlink(finalPath);
    try {
      await rename(tmpPath, finalPath);
    } catch (renameError) {
      await unlink(tmpPath).catch(() => undefined);
      throw renameError;
    }
  }
}

/**
 * Merge new one-minute bars into one month. Stored sessions stay byte for byte.
 * The provenance sidecar records this Kite request and the checksum of the file
 * after the merge. A request past the building end is refused.
 */
export async function mergeMinuteMonth(
  symbol: string,
  month: string,
  incoming: readonly Candle[],
  request: { from: string; to: string }
): Promise<string[]> {
  if (request.from > INTRADAY_BUILDING_END || request.to > INTRADAY_BUILDING_END) {
    throw new Error(`Refusing to request one-minute candles through ${request.to}.`);
  }
  const rows = incoming.filter((row) => istStamp(row.date).slice(0, 7) === month);
  if (rows.length === 0) return [];
  const finalPath = monthFile("1m", symbol, month);
  let existing = `${MINUTE_HEADER}\n`;
  if (await fileExists(finalPath)) existing = gunzipSync(await readFile(finalPath)).toString("utf8");
  const merged = mergeMinuteCsv(existing, rows);
  if (merged.addedDays.length === 0) return [];
  const sidecar = `${finalPath}.provenance.json`;
  const requests = [{ from: request.from, to: request.to }];
  if (await fileExists(sidecar)) {
    try {
      const previous = JSON.parse(await readFile(sidecar, "utf8")) as { requests?: Array<{ from: string; to: string }> };
      if (Array.isArray(previous.requests)) requests.unshift(...previous.requests);
    } catch {
      // An unreadable sidecar is replaced by the provenance of this merge.
    }
  }
  await commitGzip(finalPath, gzipSync(Buffer.from(merged.csv)));
  const dataRows = merged.csv.split("\n").filter((line) => line.length > 0 && !line.startsWith("ts_ist")).length;
  await writeFile(sidecar, `${JSON.stringify({
    ...minuteProvenance({
      symbol,
      month,
      from: request.from,
      to: request.to,
      rows: dataRows,
      csv: merged.csv,
      retrievedAt: new Date().toISOString(),
    }),
    requests,
  })}\n`);
  return merged.addedDays;
}

async function storeMinuteRows(symbol: string, rows: readonly Candle[], request: { from: string; to: string }): Promise<string[]> {
  const byMonth = new Map<string, Candle[]>();
  for (const row of rows) {
    const day = istStamp(row.date).slice(0, 10);
    if (day < INTRADAY_BUILDING_FROM || day > INTRADAY_BUILDING_END) continue;
    const month = day.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push(row);
    byMonth.set(month, list);
  }
  const added: string[] = [];
  for (const [month, monthRows] of byMonth) added.push(...(await mergeMinuteMonth(symbol, month, monthRows, request)));
  return added;
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
  await mq(`ALTER TABLE universe ADD COLUMN IF NOT EXISTS industry text`);
}

async function databaseBytes(): Promise<number> {
  const rows = await mq<{ bytes: string }>(`SELECT pg_database_size(current_database())::text AS bytes`);
  return Number(rows[0]?.bytes ?? 0);
}

export type NiftyMember = { symbol: string; industry: string };

/** NSE index CSV. Industry is the second column and the symbol is the third. */
export function parseNiftyList(text: string): NiftyMember[] {
  const out: NiftyMember[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsv(lines[i] ?? "");
    const symbol = cols[2]?.trim() ?? "";
    if (!symbol || symbol === "Symbol") continue;
    out.push({ symbol, industry: cols[1]?.trim() ?? "" });
  }
  return out;
}

function splitCsv(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      cols.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

async function niftyMembers(file: string): Promise<NiftyMember[]> {
  const response = await fetch(`https://archives.nseindia.com/content/indices/${file}`);
  if (!response.ok) throw new Error(`Nifty list ${file} returned ${response.status}`);
  return parseNiftyList(await response.text());
}

/** Missing session dates that sit on neighbouring NIFTY sessions become one fetch. */
export function groupSessionRanges(missing: string[], calendar: string[]): Array<{ from: string; to: string }> {
  const at = new Map(calendar.map((day, index) => [day, index]));
  const days = missing.filter((day) => at.has(day)).sort();
  const out: Array<{ from: string; to: string }> = [];
  let from = "";
  let to = "";
  let prev = -2;
  for (const day of days) {
    const index = at.get(day) ?? -2;
    if (from && index === prev + 1) to = day;
    else {
      if (from) out.push({ from, to });
      from = day;
      to = day;
    }
    prev = index;
  }
  if (from) out.push({ from, to });
  return out;
}

async function loadUniverse(): Promise<Set<string>> {
  const [n500, n200, n100] = await Promise.all([
    niftyMembers("ind_nifty500list.csv"),
    niftyMembers("ind_nifty200list.csv"),
    niftyMembers("ind_nifty100list.csv"),
  ]);
  const flags = new Map<string, { n500: boolean; n200: boolean; n100: boolean; industry: string }>();
  for (const row of n500) flags.set(row.symbol, { n500: true, n200: false, n100: false, industry: row.industry });
  for (const row of n200) flags.set(row.symbol, { ...(flags.get(row.symbol) ?? { n500: false, n200: false, n100: false, industry: "" }), n200: true });
  for (const row of n100) flags.set(row.symbol, { ...(flags.get(row.symbol) ?? { n500: false, n200: false, n100: false, industry: "" }), n100: true });
  const rows = [...flags.entries()].map(([symbol, row]) => [symbol, row.n500, row.n200, row.n100, row.industry]);
  await insertBatched(
    (placeholders) =>
      `INSERT INTO universe (symbol, nifty500, nifty200, nifty100, industry) VALUES ${placeholders}
       ON CONFLICT (symbol) DO UPDATE SET nifty500 = EXCLUDED.nifty500, nifty200 = EXCLUDED.nifty200, nifty100 = EXCLUDED.nifty100,
         industry = CASE WHEN EXCLUDED.industry <> '' THEN EXCLUDED.industry ELSE universe.industry END`,
    rows,
    5,
    INSTRUMENT_BATCH
  );
  return new Set(flags.keys());
}

/** Refresh the Nifty lists and their industries. No Kite calls. */
export async function syncUniverse(): Promise<number> {
  await ensureSchema();
  const names = await loadUniverse();
  return names.size;
}

async function refreshInstruments(kite: MliveKite, universe: ReadonlySet<string>, extras: ReadonlySet<string>): Promise<void> {
  const rows = await kiteCall(() => kite.instruments());
  const kept = keepInstrumentRows(rows, universe, extras);
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

async function longGameDownloadSymbols(): Promise<string[]> {
  try {
    const settings = await q<{ value: unknown }>(`SELECT value FROM mlive.mlive_settings WHERE key = 'longterm_secondary'`);
    const secondary = String(settings[0]?.value ?? "mid").replace(/"/g, "");
    const held = await q<{ symbol: string }>(`SELECT DISTINCT symbol FROM mlive.mlive_longgame_holdings WHERE units <> 0`);
    return longGameEtfSymbols(secondary, held.map((row) => String(row.symbol)));
  } catch {
    return longGameEtfSymbols("mid");
  }
}

async function earliestOpenLot(): Promise<string | null> {
  try {
    const rows = await q<{ day: string | null }>(`SELECT min(acquired_on)::text AS day FROM mlive.mlive_longgame_lots WHERE qty_open > 0`);
    const day = rows[0]?.day ? String(rows[0].day).slice(0, 10) : null;
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  } catch {
    return null;
  }
}

export async function symbolsFor(plan: SeriesPlan, only?: string[]): Promise<Array<{ token: number; symbol: string }>> {
  const rows = plan.where === "longterm"
    ? await mq<{ token: string; symbol: string }>(
      `SELECT token::text AS token, symbol FROM instruments WHERE symbol = ANY($1::text[]) ORDER BY symbol`,
      [await longGameDownloadSymbols()]
    )
    : await mq<{ token: string; symbol: string }>(
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

async function runMinuteGap(kite: MliveKite, plan: SeriesPlan, only: string[] | undefined): Promise<void> {
  if (!minuteImportMayStart(istMinutes())) {
    console.log("1m backfill stopped: outside 16:00–16:55 and 20:00–07:00 IST. Progress is unchanged.");
    return;
  }
  const free = await freeBytes(filesRoot());
  assertFreeDisk(free);
  const symbols = await symbolsFor(plan, only);
  if (symbols.length === 0) {
    console.log(`${plan.label}: no symbols`);
    return;
  }
  const from = INTRADAY_BUILDING_FROM;
  const to = INTRADAY_BUILDING_END;
  console.log(`${plan.label}: ${symbols.length} symbols ${from} to ${to}. Requests follow missing stored sessions. download_progress is not moved.`);
  const expected = await expectedSessions(from, to);
  let halt: "window" | "session" | null = null;
  let index = 0;
  for (const item of symbols) {
    index += 1;
    if (minuteImportMustStop(istMinutes())) {
      halt = "window";
      break;
    }
    const present = await minuteSessions(item.symbol, from, to);
    const missing = missingSessions(expected, present);
    const chunks = planMinuteBackfill({ progressLastTo: null, present, calendar: expected, span: plan.span });
    const requested = new Set<string>();
    const received = new Set<string>();
    for (const chunk of chunks) {
      if (minuteImportMustStop(istMinutes())) {
        halt = "window";
        break;
      }
      if (chunk.from > to || chunk.to > to) throw new Error(`Refusing to request one-minute candles through ${chunk.to}.`);
      for (const day of missing) {
        if (day >= chunk.from && day <= chunk.to) requested.add(day);
      }
      let rows: Candle[];
      try {
        rows = prepareRows(await fetchChunk(kite, item.token, plan.interval, chunk.from, chunk.to), plan.interval, chunk.from, chunk.to);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("session expired")) {
          console.log(`${message} Stored candles were kept. The forward progress marker was not moved.`);
          halt = "session";
          break;
        }
        throw error;
      }
      for (const row of rows) {
        const day = candleDay(row, "minute");
        if (day >= from && day <= to && requested.has(day)) received.add(day);
      }
      await storeMinuteRows(item.symbol, rows, chunk);
    }
    const have = new Set(present);
    for (const day of received) have.add(day);
    const still = missingSessions(expected, have).length;
    console.log(`${plan.label} ${index} of ${symbols.length} ${formatMinuteBackfillLine(item.symbol, requested.size, received.size, still)}`);
    if (halt) break;
  }
  if (halt === "window") {
    console.log("1m backfill stopped cleanly for the research window. Stored candles were kept. The forward progress marker was not moved.");
  }
  const coverage = await coverageRows(symbols.map((row) => row.symbol), from, to);
  const presentCount = coverage.reduce((sum, row) => sum + row.sessions, 0);
  console.log(formatMinuteCoverage(from, to, presentCount, expected.length * symbols.length));
}

async function runSeries(kite: MliveKite, plan: SeriesPlan, only: string[] | undefined, oneSession: boolean): Promise<void> {
  if (!oneSession && plan.id === "1m-files") {
    await runMinuteGap(kite, plan, only);
    return;
  }
  const active = plan;
  const symbols = await symbolsFor(active, only);
  if (symbols.length === 0) {
    console.log(`${plan.label}: no symbols`);
    return;
  }
  console.log(`${active.label}: ${symbols.length} symbols ${active.from} to ${active.to}`);
  let finished = 0;
  for (const item of symbols) {
    if (active.store === "neon" && (await databaseBytes()) >= SIZE_GATE) {
      console.log(`market: stopped before 650 MB while on ${active.label}. Unfinished symbols stay in download_progress.`);
      return;
    }
    const progress = await mq<{ last_to: string | null }>(
      `SELECT last_to::text AS last_to FROM download_progress WHERE symbol = $1 AND interval = $2 AND store = $3`,
      [item.symbol, active.interval, active.store]
    );
    const stored = progress[0]?.last_to ? addDays(progress[0].last_to.slice(0, 10), 1) : active.from;
    const catchingUp = oneSession && active.from < active.to;
    let cursor = stored < active.from ? active.from : stored;
    if (catchingUp) cursor = active.from;
    if (!catchingUp && cursor > active.to) {
      finished += 1;
      console.log(`${active.label} ${finished} of ${symbols.length}`);
      continue;
    }
    if (!catchingUp && oneSession && active.table && (await sessionLoaded(active.table, item.token, active.to))) {
      await saveProgress(item.symbol, active, active.to);
      finished += 1;
      console.log(`${active.label} ${finished} of ${symbols.length}`);
      continue;
    }
    const chunks = active.chunk === "month" ? monthChunks(cursor, active.to) : spanChunks(cursor, active.to, active.span);
    for (const chunk of chunks) {
      if (active.fileKind) {
        const file = monthFile(active.fileKind, item.symbol, chunk.label);
        if (await fileExists(file)) {
          await saveProgress(item.symbol, active, chunk.to);
          continue;
        }
      }
      const rows = prepareRows(await fetchChunk(kite, item.token, active.interval, chunk.from, chunk.to), active.interval, chunk.from, chunk.to);
      if (active.store === "neon" && active.table) await insertCandles(active.table, item.token, item.symbol, rows);
      else if (active.fileKind) await writeMonthFile(active.fileKind, item.symbol, chunk.label, rows);
      await saveProgress(item.symbol, active, chunk.to);
    }
    finished += 1;
    console.log(`${active.label} ${finished} of ${symbols.length}`);
  }
}

async function freeBytes(dir: string): Promise<number> {
  const stats = await statfs(dir);
  return Number(stats.bavail) * Number(stats.bsize);
}

/** First stored one-minute session at or before the building end. Later files are not opened. */
export async function firstMinuteDay(symbol: string): Promise<string | null> {
  const dir = path.join(filesRoot(), "1m", symbol);
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((name) => /^\d{4}-\d{2}\.csv\.gz$/.test(name)).sort();
  } catch {
    return null;
  }
  for (const name of names) {
    const month = name.slice(0, 7);
    if (month > INTRADAY_BUILDING_END.slice(0, 7)) break;
    const day = await firstDayInFile(path.join(dir, name), INTRADAY_BUILDING_FROM, INTRADAY_BUILDING_END);
    if (day) return day;
  }
  return null;
}

async function firstDayInFile(file: string, from: string, to: string): Promise<string | null> {
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line || line.startsWith("ts_ist")) continue;
      const day = line.slice(0, 10);
      if (day >= from && day <= to) return day;
    }
  } finally {
    lines.close();
  }
  return null;
}

async function coverageRows(symbols: string[], from: string, to: string): Promise<SymbolCoverage[]> {
  const cappedTo = to > INTRADAY_BUILDING_END ? INTRADAY_BUILDING_END : to;
  const expected = await expectedSessions(from, cappedTo);
  const rows: SymbolCoverage[] = [];
  for (const symbol of symbols) {
    const present = await minuteSessions(symbol, from, cappedTo);
    const missing = missingSessions(expected, present);
    rows.push({ symbol, sessions: present.size, missing });
  }
  return rows;
}

async function expectedSessions(from: string, to: string): Promise<string[]> {
  const rows = await mq<{ day: string }>(
    `SELECT ts::text AS day FROM candles_daily
      WHERE symbol = 'NIFTY 50' AND ts >= $1::date AND ts <= $2::date
      ORDER BY ts`,
    [from, to]
  );
  return rows.map((row) => String(row.day).slice(0, 10));
}

async function minuteSessions(symbol: string, from: string, to: string): Promise<Set<string>> {
  const present = new Set<string>();
  for (const chunk of monthChunks(from, to)) {
    if (chunk.label > INTRADAY_BUILDING_END.slice(0, 7)) break;
    const file = monthFile("1m", symbol, chunk.label);
    if (!(await fileExists(file))) continue;
    const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (!line || line.startsWith("ts_ist")) continue;
        const day = line.slice(0, 10);
        if (day >= from && day <= to) present.add(day);
      }
    } finally {
      lines.close();
    }
  }
  return present;
}

async function run(options: { oneSession: boolean; only?: string[]; series?: SeriesId; intradayRetired?: boolean }): Promise<void> {
  const minutes = istMinutes();
  if (minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30) throw new Error("Market data does not run between 09:15 and 15:30 IST.");
  await ensureSchema();
  const kite = new MliveKite(false);
  const universe = await loadUniverse();
  await refreshInstruments(kite, universe, new Set(LONG_GAME_INSTRUMENT_SYMBOLS));
  const end = todayIst();
  const sessionFrom = options.oneSession ? await sessionStart(end) : end;
  let plans = plansForRun(end, options.oneSession, options.series, sessionFrom);
  if (options.oneSession && !options.series) {
    const allowed = new Set(dailyCandlePlanIds(options.intradayRetired === true));
    plans = plans.filter((plan) => allowed.has(plan.id));
    const from = longtermDailyFrom(await earliestOpenLot());
    plans.push(longtermDailyPlan(end, sessionFrom > from ? sessionFrom : from));
  }
  if (!options.oneSession) {
    const from = longtermDailyFrom(await earliestOpenLot());
    plans = plans.map((plan) => plan.id === "longterm-daily" ? { ...plan, from } : plan);
  }
  if (options.oneSession && plans.some((plan) => plan.id === "1m-files" || plan.id === "5m-files")) {
    throw new Error("The daily market job cannot run a file plan.");
  }
  if (plans.length === 0) throw new Error("--series did not match a download");
  for (const plan of plans) await runSeries(kite, plan, options.only, options.oneSession);
  console.log(options.oneSession ? "market-daily finished" : "market-backfill finished");
}

async function gapDays(only?: string[]): Promise<Array<{ symbol: string; token: number; days: string[] }>> {
  const rows = await mq<{ symbol: string; token: string; days: unknown }>(
    `WITH calendar AS (
       SELECT ts::date AS ts FROM candles_daily WHERE symbol = 'NIFTY 50'
     ),
     bounds AS (
       SELECT d.symbol, min(d.ts)::date AS first_ts, max(d.ts)::date AS last_ts, min(i.token)::text AS token
       FROM candles_daily d
       JOIN instruments i ON i.symbol = d.symbol
       WHERE d.symbol <> 'NIFTY 50'
         AND ($1::text[] IS NULL OR d.symbol = ANY($1::text[]))
       GROUP BY d.symbol
     )
     SELECT b.symbol, b.token,
            array_agg(c.ts::text ORDER BY c.ts) AS days
     FROM bounds b
     JOIN calendar c ON c.ts BETWEEN b.first_ts AND b.last_ts
     LEFT JOIN candles_daily d ON d.symbol = b.symbol AND d.ts = c.ts
     WHERE d.ts IS NULL
     GROUP BY b.symbol, b.token
     ORDER BY b.symbol`,
    [only?.length ? only : null]
  );
  return rows.map((row) => ({ symbol: row.symbol, token: Number(row.token), days: asDayList(row.days) }));
}

function asDayList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).slice(0, 10));
  const text = String(value ?? "");
  if (text.startsWith("{") && text.endsWith("}")) {
    return text
      .slice(1, -1)
      .split(",")
      .map((item) => item.replace(/"/g, "").slice(0, 10))
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
  }
  return [];
}

/** Fetch only the daily sessions missing after each stock's own first candle. */
export async function refetchGaps(only?: string[]): Promise<{ symbols: number; ranges: number; rows: number; failed: number }> {
  const minutes = istMinutes();
  if (minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30) throw new Error("Market data does not run between 09:15 and 15:30 IST.");
  await ensureSchema();
  const calendar = (await mq<{ day: string }>(`SELECT ts::text AS day FROM candles_daily WHERE symbol = 'NIFTY 50' ORDER BY ts`)).map((row) =>
    String(row.day).slice(0, 10)
  );
  const gaps = await gapDays(only);
  console.log(`refetch-gaps: ${gaps.length} symbols with a hole after their own first candle`);
  const kite = new MliveKite(false);
  let ranges = 0;
  let rows = 0;
  let failed = 0;
  for (const item of gaps) {
    const spans = groupSessionRanges(item.days, calendar).flatMap((span) => spanChunks(span.from, span.to, 1800));
    try {
      for (const span of spans) {
        ranges += 1;
        const fetched = prepareRows(await fetchChunk(kite, item.token, "day", span.from, span.to), "day", span.from, span.to);
        if (fetched.length) await insertCandles("candles_daily", item.token, item.symbol, fetched);
        rows += fetched.length;
      }
      console.log(`refetch-gaps ${item.symbol}: ${item.days.length} missing, ${spans.length} fetches`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("session expired")) throw error;
      failed += 1;
      console.log(`refetch-gaps ${item.symbol} failed: ${message}`);
    }
  }
  console.log(`refetch-gaps finished: ${ranges} fetches, ${rows} rows, ${failed} symbols failed`);
  return { symbols: gaps.length, ranges, rows, failed };
}

export async function marketBackfill(args: MarketArgs = {}): Promise<void> {
  await runJob("market-backfill", async () => {
    if (args.refetchGaps) {
      const result = await refetchGaps(args.only);
      return { job: "market-backfill", refetchGaps: true, ...result };
    }
    await run({ oneSession: false, only: args.only, series: args.series });
    return { job: "market-backfill", only: args.only ?? null, series: args.series ?? "all" };
  });
}

export async function marketDaily(): Promise<void> {
  await runJob("market-daily", async () => {
    const settings = await loadSettings();
    await run({ oneSession: true, intradayRetired: settings.intradayRetired });
    return { job: "market-daily" };
  });
}
