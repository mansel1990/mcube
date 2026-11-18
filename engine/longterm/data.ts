import { createHash } from "node:crypto";
import { mq } from "../db";

export const LONGTERM_DATA_VERSION = "longgame-data-v2";
export const LONGTERM_BUILDING_FROM = "2011-01-01";
export const LONGTERM_BUILDING_TO = "2023-12-31";
export const LONGTERM_HELD_BACK_FROM = "2024-01-01";
export const LONGTERM_WARMUP_FROM = "2010-01-01";
export const GOLDBEES_SPLIT_EFFECTIVE = "2019-12-19";
export const GOLDBEES_SPLIT_RATIO = 100;
export const GOLDBEES_SPLIT_EXPLANATION =
  "Nippon India ETF Gold BeES 1:100 unit split effective 2019-12-19. Pre-split published NAVs are divided by 100 so the stored series stays in post-split units. The drop is a corporate action, not a market loss.";

export type LongtermLoadSample = "building" | "heldback";

export const LONGTERM_SERIES = [
  "nifty50_tri",
  "nifty_next50_tri",
  "nifty_midcap150_tri",
  "goldbees_nav",
  "nifty_1d_rate",
] as const;

export type LongtermSeriesKey = (typeof LONGTERM_SERIES)[number];
export type LongtermPoint = { date: string; value: number };
export type LongtermDataset = {
  dates: string[];
  values: Record<LongtermSeriesKey, Map<string, number>>;
  provenance: LongtermProvenance[];
  fingerprint: string;
};

export type LongtermProvenance = {
  seriesKey: LongtermSeriesKey;
  sourceUrl: string;
  sourceId: string;
  retrievedAt: string;
  checksum: string;
  rawFrom: string;
  rawTo: string;
  adjustmentMethod: string;
  missingSessions: string[];
  points: number;
};

export type ImportOptions = {
  from?: string;
  to?: string;
  heldback?: boolean;
};

const NSE_TRI_URL = "https://www.niftyindices.com/BackPage/getTotalReturnIndexString";
const NSE_CHART_URL = "https://www.niftyindices.com/Backpage/getHistoricaldataDBtoString";
const NSE_ARCHIVE_BASE = "https://archives.nseindia.com/content/indices";
const AMFI_URL = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx";
const USER_AGENT = "Mozilla/5.0 (compatible; mcube-longgame-research/1.0)";

const INDEXES: { key: LongtermSeriesKey; name: string }[] = [
  { key: "nifty50_tri", name: "NIFTY 50" },
  { key: "nifty_next50_tri", name: "NIFTY NEXT 50" },
  { key: "nifty_midcap150_tri", name: "NIFTY MIDCAP 150" },
];

export async function ensureLongtermDataSchema(): Promise<void> {
  await mq(`
    CREATE TABLE IF NOT EXISTS longterm_series (
      series_key text PRIMARY KEY,
      label text NOT NULL,
      source_kind text NOT NULL,
      adjustment_method text NOT NULL,
      data_version text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await mq(`
    CREATE TABLE IF NOT EXISTS longterm_points (
      series_key text NOT NULL REFERENCES longterm_series(series_key) ON DELETE CASCADE,
      asof_date date NOT NULL,
      value numeric NOT NULL CHECK (value > 0),
      source_checksum text NOT NULL,
      PRIMARY KEY (series_key, asof_date)
    )`);
  await mq(`
    CREATE TABLE IF NOT EXISTS longterm_provenance (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      series_key text NOT NULL REFERENCES longterm_series(series_key) ON DELETE CASCADE,
      source_url text NOT NULL,
      source_id text NOT NULL,
      retrieved_at timestamptz NOT NULL,
      checksum text NOT NULL,
      raw_from date NOT NULL,
      raw_to date NOT NULL,
      adjustment_method text NOT NULL,
      missing_sessions jsonb NOT NULL DEFAULT '[]'::jsonb,
      point_count integer NOT NULL,
      data_version text NOT NULL,
      UNIQUE (series_key, checksum)
    )`);
}

export function assertLongtermImportRange(from: string, to: string, heldback = false): void {
  if (from < LONGTERM_WARMUP_FROM || from > to) {
    throw new Error(`Long Game import must start on or after ${LONGTERM_WARMUP_FROM} and end on or after it starts.`);
  }
  if (!heldback && to > LONGTERM_BUILDING_TO) {
    throw new Error(`Long Game building import stops at ${LONGTERM_BUILDING_TO}. Pass --heldback to import later sessions.`);
  }
  if (heldback && to < LONGTERM_HELD_BACK_FROM) {
    throw new Error("Held-back import must include a session on or after 2024-01-01.");
  }
}

export function normalizeGoldbeesNav(points: LongtermPoint[]): LongtermPoint[] {
  return points.map((point) => (
    point.date < GOLDBEES_SPLIT_EFFECTIVE
      ? { date: point.date, value: point.value / GOLDBEES_SPLIT_RATIO }
      : point
  ));
}

export function visibleToSample<T extends { rawFrom: string; rawTo: string }>(
  rows: readonly T[],
  sample: LongtermLoadSample,
  through: string
): T[] {
  if (sample === "building") {
    return rows.filter((row) => row.rawFrom <= LONGTERM_BUILDING_TO && row.rawTo <= LONGTERM_BUILDING_TO);
  }
  return rows.filter((row) => row.rawFrom <= through && row.rawTo <= through);
}

export function pointVisibleToSample(date: string, sample: LongtermLoadSample, through: string): boolean {
  if (date < LONGTERM_WARMUP_FROM) return false;
  if (sample === "building") return date <= LONGTERM_BUILDING_TO;
  return date <= through;
}

export function fingerprintLongtermDataset(input: {
  sample: LongtermLoadSample;
  through: string;
  provenance: readonly { seriesKey: string; checksum: string }[];
  ranges: readonly (readonly [string, number, string, string])[];
}): string {
  return sha256(JSON.stringify({
    version: LONGTERM_DATA_VERSION,
    sample: input.sample,
    through: input.through,
    sources: input.provenance.map((row) => [row.seriesKey, row.checksum]).sort(),
    ranges: input.ranges,
  }));
}

export function latestCommonCompleteSession(dates: readonly string[], from = LONGTERM_HELD_BACK_FROM): string {
  const last = [...dates].reverse().find((date) => date >= from);
  if (!last) throw new Error("Long Game has no common complete session on or after 2024-01-01.");
  return last;
}

export async function importLongtermData(options: ImportOptions = {}): Promise<void> {
  const heldback = options.heldback === true;
  const from = options.from ?? LONGTERM_WARMUP_FROM;
  const to = options.to ?? (heldback ? from : LONGTERM_BUILDING_TO);
  assertLongtermImportRange(from, to, heldback);
  await ensureLongtermDataSchema();
  for (const index of INDEXES) {
    const chunks = yearChunks(from, to);
    for (const chunk of chunks) {
      if (await hasStoredChunk(index.key, chunk.from, chunk.to)) continue;
      const fetched = await fetchNiftyTri(index.name, chunk.from, chunk.to);
      await storeChunk(index.key, index.name, "nse-indices-tri", "Gross total-return index; dividends reinvested", fetched);
    }
  }
  for (const chunk of dayChunks(from, to, 90)) {
    if (await hasStoredChunk("goldbees_nav", chunk.from, chunk.to)) continue;
    const fetched = await fetchGoldNav(chunk.from, chunk.to);
    if (fetched.points.length) {
      await storeChunk(
        "goldbees_nav",
        "Nippon India ETF Gold BeES NAV",
        "amfi-adjusted-nav",
        `Published AMFI NAV; fund expenses and corporate actions reflected. ${GOLDBEES_SPLIT_EXPLANATION}`,
        fetched
      );
    }
  }
  for (const chunk of dayChunks(LONGTERM_BUILDING_FROM, to, 90)) {
    if (await hasStoredChunk("nifty_1d_rate", chunk.from, chunk.to)) continue;
    const fetched = await fetchNifty1dRate(chunk.from, chunk.to);
    if (fetched) {
      await storeChunk("nifty_1d_rate", "NIFTY 1D Rate Index", "nse-fixed-income", "Official fixed-income total-return index", fetched);
    }
  }
  await backfillNifty1dArchives(to);
  await validateLongtermCoverage();
}

export async function loadLongtermDataset(
  sample: LongtermLoadSample = "building",
  options: { annotate?: boolean; through?: string } = {}
): Promise<LongtermDataset> {
  await ensureLongtermDataSchema();
  const through = sample === "building" ? LONGTERM_BUILDING_TO : (options.through ?? "2999-12-31");
  const pointRows = await mq<{ series_key: string; asof_date: string; value: string | number }>(
    `SELECT series_key, asof_date::text, value
       FROM longterm_points
      WHERE asof_date BETWEEN $1::date AND $2::date
      ORDER BY asof_date`,
    [LONGTERM_WARMUP_FROM, through]
  );
  const values = Object.fromEntries(LONGTERM_SERIES.map((key) => [key, new Map<string, number>()])) as Record<LongtermSeriesKey, Map<string, number>>;
  for (const row of pointRows) {
    if (!isSeriesKey(row.series_key)) continue;
    const date = String(row.asof_date).slice(0, 10);
    if (!pointVisibleToSample(date, sample, through)) continue;
    values[row.series_key].set(date, Number(row.value));
  }
  const calendar = [...values.nifty50_tri.keys()].filter((date) => pointVisibleToSample(date, sample, through)).sort();
  const provenance = visibleToSample(await loadProvenance(sample, through), sample, through);
  if (options.annotate !== false) await annotateMissingSessions(calendar, values, provenance);
  const dates = assertCoverage(calendar, values, sample);
  if (sample === "building" && dates.some((date) => date >= LONGTERM_HELD_BACK_FROM)) {
    throw new Error("Long Game building load observed a held-back date.");
  }
  const fingerprint = fingerprintLongtermDataset({
    sample,
    through: sample === "building" ? LONGTERM_BUILDING_TO : dates.filter((date) => date >= LONGTERM_HELD_BACK_FROM).at(-1) ?? LONGTERM_HELD_BACK_FROM,
    provenance,
    ranges: LONGTERM_SERIES.map((key) => [key, values[key].size, first(values[key]), last(values[key])]),
  });
  return { dates, values, provenance, fingerprint };
}

export async function longtermDataIdentity(
  sample: LongtermLoadSample = "building"
): Promise<{ last: string; fingerprint: string }> {
  const dataset = await loadLongtermDataset(sample, { annotate: false });
  const last = sample === "building"
    ? dataset.dates.filter((date) => date <= LONGTERM_BUILDING_TO).at(-1) ?? ""
    : latestCommonCompleteSession(dataset.dates);
  return { last, fingerprint: dataset.fingerprint };
}

export async function validateLongtermCoverage(): Promise<void> {
  await loadLongtermDataset();
}

export function parseNiftyTriResponse(raw: string): LongtermPoint[] {
  const outer = JSON.parse(raw) as unknown;
  const data = typeof outer === "object" && outer && "d" in outer
    ? JSON.parse(String((outer as { d: unknown }).d)) as unknown
    : outer;
  if (!Array.isArray(data)) throw new Error("NSE Indices TRI response was not an array.");
  return data.map((row) => {
    const item = row as Record<string, unknown>;
    return { date: parseDate(String(item.Date ?? item.TRIDate ?? "")), value: Number(item.TotalReturnsIndex ?? item["Total Returns Index"]) };
  }).filter(validPoint).sort(byDate);
}

export function parseAmfiGoldNav(raw: string): LongtermPoint[] {
  const points: LongtermPoint[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const fields = line.split(";").map((item) => item.trim());
    const name = fields[1] ?? "";
    if (!/gold\s*bees/i.test(name)) continue;
    const date = parseDate(fields.at(-1) ?? "");
    let value = 0;
    for (let i = fields.length - 2; i >= 2; i--) {
      const candidate = Number(fields[i]);
      if (Number.isFinite(candidate) && candidate > 0) {
        value = candidate;
        break;
      }
    }
    if (date && value > 0) points.push({ date, value });
  }
  return dedupe(points);
}

export function parseNseFixedIncomeResponse(raw: string): LongtermPoint[] {
  const body = JSON.parse(raw) as unknown;
  const rows = findRecordArray(body);
  const points: LongtermPoint[] = [];
  for (const row of rows) {
    const dateValue = pick(row, ["EOD_TIMESTAMP", "HistoricalDate", "Index Date", "date", "Date"]);
    const closeValue = pick(row, ["EOD_CLOSE_INDEX_VAL", "CLOSE", "Closing Index Value", "close", "Close"]);
    const point = { date: parseDate(String(dateValue ?? "")), value: Number(String(closeValue ?? "").replace(/,/g, "")) };
    if (validPoint(point)) points.push(point);
  }
  return dedupe(points);
}

function assertCoverage(
  calendar: string[],
  values: Record<LongtermSeriesKey, Map<string, number>>,
  sample: LongtermLoadSample = "building"
): string[] {
  const warmup = calendar.filter((date) => date < LONGTERM_BUILDING_FROM);
  if (warmup.length < 240) throw new Error(`Long Game needs at least 240 NIFTY sessions of warm-up; found ${warmup.length}.`);
  const buildingSpan = calendar.filter((date) => date >= LONGTERM_BUILDING_FROM && date <= LONGTERM_BUILDING_TO);
  const building = calendar.filter((date) => date >= LONGTERM_BUILDING_FROM);
  if (!buildingSpan.length || buildingSpan[0] > "2011-01-10" || buildingSpan.at(-1)! < "2023-12-20") {
    throw new Error(`Long Game exact building window is incomplete (${buildingSpan[0] ?? "missing"} through ${buildingSpan.at(-1) ?? "missing"}).`);
  }
  for (const key of LONGTERM_SERIES) {
    const requiredDates = key === "nifty_1d_rate" ? building : calendar;
    const missing = requiredDates.filter((date) => !values[key].has(date));
    if (missing.length / requiredDates.length > 0.04) {
      throw new Error(`${key} is missing ${missing.length} of ${requiredDates.length} NIFTY sessions; first missing ${missing.slice(0, 5).join(", ")}. No forward-fill was applied.`);
    }
  }
  const common = calendar.filter((date) => {
    const keys = date < LONGTERM_BUILDING_FROM ? LONGTERM_SERIES.filter((key) => key !== "nifty_1d_rate") : LONGTERM_SERIES;
    return keys.every((key) => values[key].has(date));
  });
  const commonWarmup = common.filter((date) => date < LONGTERM_BUILDING_FROM);
  const commonBuilding = common.filter((date) => date >= LONGTERM_BUILDING_FROM && date <= LONGTERM_BUILDING_TO);
  if (commonWarmup.length < 240) throw new Error(`Long Game common-series warm-up has only ${commonWarmup.length} sessions.`);
  if (!commonBuilding.length || commonBuilding[0] > "2011-01-10" || commonBuilding.at(-1)! < "2023-12-20") {
    throw new Error("Long Game cannot produce the exact common 2011–2023 building window.");
  }
  if (sample === "heldback" && !common.some((date) => date >= LONGTERM_HELD_BACK_FROM)) {
    throw new Error("Long Game held-back load has no common complete session on or after 2024-01-01.");
  }
  if (sample === "building") return common.filter((date) => date <= LONGTERM_BUILDING_TO);
  return common.filter((date) => date <= calendar.at(-1)!);
}

async function fetchNiftyTri(name: string, from: string, to: string): Promise<FetchedChunk> {
  const cinfo = `{'name':'${name}','startDate':'${apiDate(from)}','endDate':'${apiDate(to)}','indexName':'${name}'}`;
  const response = await fetchWithRetry(NSE_TRI_URL, {
    method: "POST",
    headers: nseHeaders("https://www.niftyindices.com/reports/historical-data"),
    body: JSON.stringify({ cinfo }),
  });
  const raw = await response.text();
  return fetched(NSE_TRI_URL, `${name}:${from}:${to}`, raw, parseNiftyTriResponse(raw), from, to);
}

async function fetchGoldNav(from: string, to: string): Promise<FetchedChunk> {
  const sourceUrls = ["36", "49", "21"].map(
    (fund) => `${AMFI_URL}?mf=${fund}&tp=1&frmdt=${apiDate(from)}&todt=${apiDate(to)}`
  );
  const sourceUrl = sourceUrls.join(" | ");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const parts: string[] = [];
    for (const url of sourceUrls) {
      const response = await fetchWithRetry(url, { headers: { "user-agent": USER_AGENT, accept: "text/plain,*/*" } });
      parts.push(await response.text());
    }
    const raw = parts.join("\n");
    const points = parseAmfiGoldNav(raw);
    if (points.length) {
      const normalized = normalizeGoldbeesNav(points).filter((point) => point.date >= from && point.date <= to);
      return fetched(sourceUrl, `GoldBeES AMFI funds 36/49/21:${from}:${to}`, `${raw}\n${LONGTERM_DATA_VERSION}\n${GOLDBEES_SPLIT_EFFECTIVE}`, normalized, from, to);
    }
    console.log(`longterm-import AMFI retry ${attempt} ${from}..${to}: bytes ${parts.map((part) => part.length).join("/")}, Gold BeES points 0`);
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  throw new Error(`AMFI returned an incomplete Gold BeES chunk for ${from} through ${to} after 3 attempts.`);
}

async function fetchNifty1dRate(from: string, to: string): Promise<FetchedChunk | null> {
  const name = "NIFTY 1D RATE INDEX";
  const cinfo = `{'name':'${name}','startDate':'${apiDate(from)}','endDate':'${apiDate(to)}','historicaltype' :'2','DataType' : 'HR'}`;
  const response = await fetchWithRetry(NSE_CHART_URL, {
    method: "POST",
    headers: nseHeaders("https://www.niftyindices.com/indices/fixed-income/money-market-indices/nifty-1d-rate"),
    body: JSON.stringify({ cinfo }),
  });
  const raw = await response.text();
  const points = parseNseFixedIncomeResponse(raw);
  if (!points.length) {
    console.log(`longterm-import nifty_1d_rate ${from}..${to}: official chart endpoint gap, checking daily archives`);
    return null;
  }
  return fetched(NSE_CHART_URL, `NIFTY 1D RATE INDEX:${from}:${to}`, raw, points, from, to);
}

async function backfillNifty1dArchives(to: string): Promise<void> {
  const rows = await mq<{ asof_date: string }>(
    `SELECT n.asof_date::text
       FROM longterm_points n
       LEFT JOIN longterm_points l
         ON l.series_key = 'nifty_1d_rate' AND l.asof_date = n.asof_date
      WHERE n.series_key = 'nifty50_tri'
        AND n.asof_date BETWEEN '2018-09-01'::date AND $1::date
        AND l.asof_date IS NULL
      ORDER BY n.asof_date`,
    [to]
  );
  const byYear = new Map<string, { raw: string[]; points: LongtermPoint[]; urls: string[] }>();
  for (const row of rows) {
    const date = String(row.asof_date).slice(0, 10);
    const compact = `${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(0, 4)}`;
    const url = `${NSE_ARCHIVE_BASE}/ind_close_all_${compact}.csv`;
    let response: Response;
    try {
      response = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const raw = await response.text();
    const point = parseNifty1dArchive(raw);
    if (!point) continue;
    const group = byYear.get(date.slice(0, 4)) ?? { raw: [], points: [], urls: [] };
    group.raw.push(raw);
    group.points.push(point);
    group.urls.push(url);
    byYear.set(date.slice(0, 4), group);
  }
  for (const [year, group] of byYear) {
    const raw = group.raw.join("\n");
    await storeChunk(
      "nifty_1d_rate",
      "NIFTY 1D Rate Index",
      "nse-fixed-income-archive",
      "Official fixed-income total-return index; daily NSE archive repaired a chart-endpoint gap",
      fetched(
        `${NSE_ARCHIVE_BASE}/ind_close_all_DDMMYYYY.csv`,
        `NSE daily index archives ${year} (${group.urls.length} files)`,
        raw,
        group.points,
        `${year}-01-01`,
        `${year}-12-31`
      )
    );
  }
}

function parseNifty1dArchive(raw: string): LongtermPoint | null {
  const line = raw.split(/\r?\n/).find((value) => /^Nifty 1D Rate Index,/i.test(value.trim()));
  if (!line) return null;
  const fields = line.split(",").map((value) => value.trim());
  const point = { date: parseDate(fields[1] ?? ""), value: Number(fields[5]) };
  return validPoint(point) ? point : null;
}

type FetchedChunk = {
  sourceUrl: string;
  sourceId: string;
  retrievedAt: string;
  checksum: string;
  rawFrom: string;
  rawTo: string;
  points: LongtermPoint[];
};

async function storeChunk(
  key: LongtermSeriesKey,
  label: string,
  sourceKind: string,
  adjustmentMethod: string,
  chunk: FetchedChunk
): Promise<void> {
  await mq(
    `INSERT INTO longterm_series (series_key, label, source_kind, adjustment_method, data_version)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (series_key) DO UPDATE
       SET label = EXCLUDED.label, source_kind = EXCLUDED.source_kind,
           adjustment_method = EXCLUDED.adjustment_method, data_version = EXCLUDED.data_version, updated_at = now()`,
    [key, label, sourceKind, adjustmentMethod, LONGTERM_DATA_VERSION]
  );
  for (const point of chunk.points) {
    await mq(
      `INSERT INTO longterm_points (series_key, asof_date, value, source_checksum)
       VALUES ($1,$2::date,$3,$4)
       ON CONFLICT (series_key, asof_date) DO UPDATE
         SET value = EXCLUDED.value, source_checksum = EXCLUDED.source_checksum`,
      [key, point.date, point.value, chunk.checksum]
    );
  }
  await mq(
    `INSERT INTO longterm_provenance
       (series_key, source_url, source_id, retrieved_at, checksum, raw_from, raw_to,
        adjustment_method, missing_sessions, point_count, data_version)
     VALUES ($1,$2,$3,$4::timestamptz,$5,$6::date,$7::date,$8,'[]'::jsonb,$9,$10)
     ON CONFLICT (series_key, checksum) DO UPDATE
       SET data_version = EXCLUDED.data_version,
           adjustment_method = EXCLUDED.adjustment_method,
           point_count = EXCLUDED.point_count`,
    [key, chunk.sourceUrl, chunk.sourceId, chunk.retrievedAt, chunk.checksum, chunk.rawFrom, chunk.rawTo, adjustmentMethod, chunk.points.length, LONGTERM_DATA_VERSION]
  );
  console.log(`longterm-import ${key} ${chunk.rawFrom}..${chunk.rawTo}: ${chunk.points.length} points`);
}

async function loadProvenance(sample: LongtermLoadSample, through: string): Promise<LongtermProvenance[]> {
  const rows = await mq<Record<string, unknown>>(
    `SELECT series_key, source_url, source_id, retrieved_at::text, checksum,
            raw_from::text, raw_to::text, adjustment_method, missing_sessions, point_count
       FROM longterm_provenance
      WHERE data_version = $1
        AND raw_to <= $2::date
        AND raw_from <= $2::date
      ORDER BY series_key, raw_from`,
    [LONGTERM_DATA_VERSION, sample === "building" ? LONGTERM_BUILDING_TO : through]
  );
  return rows.map((row) => ({
    seriesKey: row.series_key as LongtermSeriesKey,
    sourceUrl: String(row.source_url),
    sourceId: String(row.source_id),
    retrievedAt: String(row.retrieved_at),
    checksum: String(row.checksum),
    rawFrom: String(row.raw_from).slice(0, 10),
    rawTo: String(row.raw_to).slice(0, 10),
    adjustmentMethod: String(row.adjustment_method),
    missingSessions: Array.isArray(row.missing_sessions) ? row.missing_sessions.map(String) : [],
    points: Number(row.point_count),
  }));
}

async function annotateMissingSessions(
  calendar: string[],
  values: Record<LongtermSeriesKey, Map<string, number>>,
  provenance: LongtermProvenance[]
): Promise<void> {
  for (const row of provenance) {
    const missing = calendar.filter((date) =>
      date >= row.rawFrom
      && date <= row.rawTo
      && !(row.seriesKey === "nifty_1d_rate" && date < LONGTERM_BUILDING_FROM)
      && !values[row.seriesKey].has(date)
    );
    row.missingSessions = missing;
    await mq(
      `UPDATE longterm_provenance SET missing_sessions = $2::jsonb
        WHERE series_key = $1 AND checksum = $3`,
      [row.seriesKey, JSON.stringify(missing), row.checksum]
    );
  }
}

async function hasStoredChunk(key: LongtermSeriesKey, from: string, to: string): Promise<boolean> {
  const rows = await mq<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM longterm_provenance
        WHERE series_key = $1 AND raw_from = $2::date AND raw_to = $3::date AND data_version = $4
     ) AS present`,
    [key, from, to, LONGTERM_DATA_VERSION]
  );
  return rows[0]?.present === true;
}

function fetched(sourceUrl: string, sourceId: string, raw: string, points: LongtermPoint[], rawFrom: string, rawTo: string): FetchedChunk {
  if (!points.length) throw new Error(`${sourceId} returned no valid points.`);
  return { sourceUrl, sourceId, retrievedAt: new Date().toISOString(), checksum: sha256(raw), rawFrom, rawTo, points };
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return response;
      last = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      last = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw new Error(`Could not fetch official Long Game source ${url}: ${last instanceof Error ? last.message : String(last)}`);
}

function nseHeaders(referer: string): Record<string, string> {
  return {
    "content-type": "application/json; charset=UTF-8",
    accept: "application/json, text/javascript, */*; q=0.01",
    "x-requested-with": "XMLHttpRequest",
    origin: "https://www.niftyindices.com",
    referer,
    "user-agent": USER_AGENT,
  };
}

function findRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
    return value as Record<string, unknown>[];
  }
  if (!value || typeof value !== "object") return [];
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = findRecordArray(child);
    if (found.length) return found;
  }
  return [];
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (row[key] != null) return row[key];
  return null;
}

function parseDate(value: string): string {
  const clean = value.trim();
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const numeric = clean.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (numeric) return `${numeric[3]}-${numeric[2]}-${numeric[1]}`;
  const named = clean.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/);
  if (named) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(named[2].toLowerCase()) + 1;
    if (month > 0) return `${named[3]}-${String(month).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  return "";
}

function validPoint(point: LongtermPoint): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value > 0;
}

function dedupe(points: LongtermPoint[]): LongtermPoint[] {
  return [...new Map(points.filter(validPoint).map((point) => [point.date, point])).values()].sort(byDate);
}

function byDate(a: LongtermPoint, b: LongtermPoint): number {
  return a.date.localeCompare(b.date);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSeriesKey(value: string): value is LongtermSeriesKey {
  return (LONGTERM_SERIES as readonly string[]).includes(value);
}

function first(values: Map<string, number>): string {
  return [...values.keys()].sort()[0] ?? "";
}

function last(values: Map<string, number>): string {
  return [...values.keys()].sort().at(-1) ?? "";
}

function apiDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1];
  if (!year || !name || !day) throw new Error(`Invalid source date ${iso}`);
  return `${String(day).padStart(2, "0")}-${name}-${year}`;
}

function yearChunks(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    out.push({ from: year === Number(from.slice(0, 4)) ? from : `${year}-01-01`, to: year === Number(to.slice(0, 4)) ? to : `${year}-12-31` });
  }
  return out;
}

function dayChunks(from: string, to: string, days: number): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const chunkEnd = new Date(Math.min(end.getTime(), cursor.getTime() + (days - 1) * 86_400_000));
    out.push({ from: cursor.toISOString().slice(0, 10), to: chunkEnd.toISOString().slice(0, 10) });
    cursor = new Date(chunkEnd.getTime() + 86_400_000);
  }
  return out;
}
