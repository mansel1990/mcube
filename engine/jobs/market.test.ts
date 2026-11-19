import { readFileSync } from "fs";
import { mkdtemp, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { gunzipSync } from "zlib";
import { addDays } from "@/lib/mlive/calendar";
import { describe, expect, it } from "vitest";
import { candleChecksum, formatMinuteBackfillLine, formatMinuteCoverage } from "./market-window";
import {
  CANDLE_BATCH,
  INSTRUMENT_BATCH,
  KITE_BACKOFF_MS,
  KITE_GAP_MS,
  candleCsv,
  keepInstrumentRows,
  mergeMinuteMonth,
  monthChunks,
  monthFile,
  catchupFrom,
  groupSessionRanges,
  parseMarketArgs,
  parseNiftyList,
  planMinuteBackfill,
  seriesPlans,
  spanChunks,
  dailyMarketPlanIds,
  longtermDailyPlan,
  writeMonthFile,
} from "./market";
import { LONG_GAME_INSTRUMENT_SYMBOLS, longGameEtfSymbols } from "@/lib/mlive/long-game-symbols";

function inclusiveDays(from: string, to: string): number {
  let count = 1;
  let cursor = from;
  while (cursor < to) {
    cursor = addDays(cursor, 1);
    count += 1;
  }
  return count;
}

describe("market history layout", () => {
  it("splits history into calendar months and bounded spans", () => {
    expect(monthChunks("2024-11-16", "2025-01-05")).toEqual([
      { from: "2024-11-16", to: "2024-11-30", label: "2024-11" },
      { from: "2024-12-01", to: "2024-12-31", label: "2024-12" },
      { from: "2025-01-01", to: "2025-01-05", label: "2025-01" },
    ]);
    expect(monthChunks("2024-02-01", "2024-03-01")).toEqual([
      { from: "2024-02-01", to: "2024-02-29", label: "2024-02" },
      { from: "2024-03-01", to: "2024-03-01", label: "2024-03" },
    ]);
    expect(monthChunks("2025-02-01", "2025-02-28")).toEqual([{ from: "2025-02-01", to: "2025-02-28", label: "2025-02" }]);
    expect(monthChunks("2026-11-17", "2026-11-16")).toEqual([]);

    const spans = spanChunks("2015-01-01", "2019-12-31", 1800);
    expect(spans[0]?.from).toBe("2015-01-01");
    expect(spans[spans.length - 1]?.to).toBe("2019-12-31");
    for (const chunk of spans) expect(inclusiveDays(chunk.from, chunk.to)).toBeLessThanOrEqual(1800);
    for (let i = 1; i < spans.length; i++) expect(spans[i]?.from).toBe(addDays(spans[i - 1]?.to ?? "", 1));
    expect(spanChunks("2026-11-16", "2026-11-10", 90)).toEqual([]);
  });

  it("keeps the long intraday history out of Neon", () => {
    const plans = seriesPlans("2026-11-16");
    expect(plans.map((plan) => plan.id)).toEqual(["daily", "5m-neon", "5m-files", "1m-files"]);
    expect(plans[0]).toMatchObject({ store: "neon", table: "candles_daily", from: "2015-01-01", indexes: true });
    const fiveNeon = plans[1];
    expect(fiveNeon).toMatchObject({ store: "neon", table: "candles_5m", chunk: "span", span: 90 });
    expect(inclusiveDays(fiveNeon?.from ?? "", "2026-11-16")).toBe(90);
    expect(plans[2]).toMatchObject({ store: "file", fileKind: "5m", chunk: "month", from: addDays("2026-11-16", -730), barsPerDay: 75 });
    expect(plans[3]).toMatchObject({ store: "file", fileKind: "1m", table: null, from: "2024-11-18", barsPerDay: 375 });
    expect(plans.some((plan) => plan.table === "candles_1m")).toBe(false);
  });

  it("fills missed sessions from the day after the last daily candle", () => {
    expect(catchupFrom("2026-11-17", "2026-11-12", "2026-11-16")).toBe("2026-11-13");
    expect(catchupFrom("2026-11-17", "2026-11-16", "2026-11-16")).toBe("2026-11-17");
    expect(catchupFrom("2026-11-17", "2026-11-17", "2026-11-16")).toBe("2026-11-17");
    expect(catchupFrom("2026-11-17", null, "2026-11-16")).toBe("2026-11-17");
  });

  it("parses a smoke-test symbol list that includes NIFTY 50", () => {
    expect(parseMarketArgs(["--only", "INFY,NIFTY 50"])).toEqual({ only: ["INFY", "NIFTY 50"] });
    expect(parseMarketArgs(["--only", "INFY,NIFTY", "50", "--series", "5m-files"])).toEqual({
      only: ["INFY", "NIFTY 50"],
      series: "5m-files",
    });
    expect(parseMarketArgs([])).toEqual({});
    expect(parseMarketArgs(["--refetch-gaps", "--only", "TATASTEEL"])).toEqual({ refetchGaps: true, only: ["TATASTEEL"] });
    expect(() => parseMarketArgs(["--series", "minute"])).toThrow(/--series/);
    expect(parseNiftyList('Company Name,Industry,Symbol,Series\n"Trent Ltd",Retail,TRENT,EQ\n')).toEqual([
      { symbol: "TRENT", industry: "Retail" },
    ]);
    const calendar = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"];
    expect(groupSessionRanges(["2024-01-03", "2024-01-04"], calendar)).toEqual([{ from: "2024-01-03", to: "2024-01-04" }]);
    expect(groupSessionRanges(["2024-01-03", "2024-01-05"], calendar)).toEqual([
      { from: "2024-01-03", to: "2024-01-03" },
      { from: "2024-01-05", to: "2024-01-05" },
    ]);
  });

  it("keeps Long Game ETFs on a daily plan outside the Swing universe", () => {
    const universe = ["INFY", "TCS"];
    const before = [...universe];
    const ranking = ["INFY", "TCS"];
    expect(longGameEtfSymbols("mid")).toEqual(["NIFTYBEES", "MID150BEES", "GOLDBEES", "LIQUIDBEES"]);
    expect(longGameEtfSymbols("next", ["MID150BEES"])).toEqual(["NIFTYBEES", "JUNIORBEES", "GOLDBEES", "LIQUIDBEES", "MID150BEES"]);
    expect(universe).toEqual(before);
    expect(ranking).toEqual(["INFY", "TCS"]);
    const plan = longtermDailyPlan("2026-11-19");
    expect(plan).toMatchObject({ id: "longterm-daily", interval: "day", table: "candles_daily", store: "neon", indexes: false, where: "longterm" });
    expect(dailyMarketPlanIds(false)).toEqual(["daily", "5m-neon", "longterm-daily"]);
    expect(dailyMarketPlanIds(true)).toEqual(["daily", "longterm-daily"]);
    const intraday = seriesPlans("2026-11-19").filter((item) => item.interval !== "day");
    expect(intraday.map((item) => item.id)).toEqual(["5m-neon", "5m-files", "1m-files"]);
    expect(intraday.some((item) => item.id === "longterm-daily")).toBe(false);
    const kept = keepInstrumentRows(
      [
        { token: 1, symbol: "INFY", tick: 0.05, type: "EQ" },
        { token: 9, symbol: "NIFTYBEES", tick: 0.01, type: "EQ" },
        { token: 10, symbol: "LIQUIDBEES", tick: 0.01, type: "EQ" },
        { token: 11, symbol: "NIFTYBEES", tick: 0.01, type: "FUT" },
      ],
      new Set(universe),
      new Set(LONG_GAME_INSTRUMENT_SYMBOLS)
    );
    expect(kept.map((row) => row.symbol)).toEqual(["INFY", "NIFTYBEES", "LIQUIDBEES"]);
    expect(universe).toEqual(["INFY", "TCS"]);
    expect(parseMarketArgs(["--series", "longterm-daily"]).series).toBe("longterm-daily");
    expect(readFileSync(new URL("./market.ts", import.meta.url), "utf8")).not.toContain("exclude_symbols");
  });

  it("keeps universe equities and indexes, and batches inserts", () => {
    const kept = keepInstrumentRows(
      [
        { token: 1, symbol: "INFY", tick: 0.05, type: "EQ" },
        { token: 2, symbol: "TCS", tick: 0.05, type: "EQ" },
        { token: 3, symbol: "INFY", tick: 0.05, type: "FUT" },
        { token: 4, symbol: "NIFTY 50", tick: 0, type: "EQ" },
        { token: 5, symbol: "RELIANCE", tick: 0.05, type: "BE" },
        { token: 0, symbol: "SBIN", tick: 0.05, type: "EQ" },
      ],
      new Set(["INFY", "SBIN"])
    );
    expect(kept.map((row) => row.symbol)).toEqual(["INFY", "NIFTY 50"]);
    expect(INSTRUMENT_BATCH).toBe(500);
    expect(CANDLE_BATCH).toBe(1000);
    expect(KITE_GAP_MS).toBe(350);
    expect(KITE_BACKOFF_MS).toEqual([2000, 5000, 15000]);
  });

  it("writes a month file by renaming a temp gzip", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcube-candles-"));
    const previous = process.env.MARKET_FILES_DIR;
    process.env.MARKET_FILES_DIR = root;
    try {
      await writeMonthFile("5m", "INFY", "2026-11", [
        { date: "2026-11-16T03:45:00.000Z", open: 1, high: 2, low: 0.5, close: 1.5, volume: 9 },
      ]);
      const finalPath = monthFile("5m", "INFY", "2026-11");
      const text = gunzipSync(await readFile(finalPath)).toString("utf8");
      expect(text).toBe("ts_ist,open,high,low,close,volume\n2026-11-16 09:15:00,1,2,0.5,1.5,9\n");
      expect(candleCsv([])).toBe("ts_ist,open,high,low,close,volume\n");
      const names = await readdir(path.dirname(finalPath));
      expect(names.filter((name) => name.endsWith(".tmp"))).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.MARKET_FILES_DIR;
      else process.env.MARKET_FILES_DIR = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requests the file gap when progress is already past the building end", () => {
    const calendar = weekdays("2024-11-18", "2026-05-04");
    const present = new Set(calendar.filter((day) => day >= "2025-11-17" && day <= "2026-04-30"));
    const progressLastTo = "2026-11-17";
    expect(addDays(progressLastTo, 1) > "2026-04-30").toBe(true);
    const chunks = planMinuteBackfill({ progressLastTo, present, calendar, span: 31 });
    expect(chunks[0]?.from).toBe("2024-11-18");
    expect(chunks.some((chunk) => chunk.from <= "2025-11-14" && chunk.to >= "2025-11-14")).toBe(true);
    expect(chunks.every((chunk) => chunk.from <= "2026-04-30" && chunk.to <= "2026-04-30")).toBe(true);
    expect(chunks.some((chunk) => chunk.from >= "2026-05-01" || chunk.to >= "2026-05-01")).toBe(false);
    for (const day of calendar) {
      if (day < "2024-11-18" || day > "2025-11-14") continue;
      expect(chunks.some((chunk) => chunk.from <= day && chunk.to >= day)).toBe(true);
    }
    for (const chunk of chunks) expect(inclusiveDays(chunk.from, chunk.to)).toBeLessThanOrEqual(31);
    expect(formatMinuteBackfillLine("WIPRO", 247, 240, 7)).toBe("WIPRO: requested 247 received 240 still missing 7");
    expect(formatMinuteCoverage("2024-11-18", "2026-04-30", 112, 359)).toBe("1m coverage 2024-11-18..2026-04-30: 31.2% (112/359 sessions)");
  });

  it("keeps stored one-minute rows and refuses a May 2026 request", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mcube-candles-"));
    const previous = process.env.MARKET_FILES_DIR;
    process.env.MARKET_FILES_DIR = root;
    try {
      await writeMonthFile("1m", "WIPRO", "2025-11", [
        { date: "2025-11-17T03:45:00.000Z", open: 10, high: 11, low: 9, close: 10, volume: 100 },
      ]);
      const added = await mergeMinuteMonth(
        "WIPRO",
        "2025-11",
        [
          { date: "2025-11-17T03:45:00.000Z", open: 1, high: 1, low: 1, close: 999, volume: 1 },
          { date: "2025-11-14T03:45:00.000Z", open: 5, high: 6, low: 4, close: 5, volume: 7 },
        ],
        { from: "2024-11-18", to: "2025-11-14" }
      );
      expect(added).toEqual(["2025-11-14"]);
      const finalPath = monthFile("1m", "WIPRO", "2025-11");
      const text = gunzipSync(await readFile(finalPath)).toString("utf8");
      expect(text).toContain("2025-11-17 09:15:00,10,11,9,10,100");
      expect(text).toContain("2025-11-14 09:15:00,5,6,4,5,7");
      expect(text).not.toContain("999");
      const sidecar = JSON.parse(await readFile(`${finalPath}.provenance.json`, "utf8")) as { source: string; from: string; to: string; checksum: string };
      expect(sidecar.source).toBe("kite.historical");
      expect(sidecar.from).toBe("2024-11-18");
      expect(sidecar.to).toBe("2025-11-14");
      expect(sidecar.checksum).toBe(candleChecksum(text));
      const names = await readdir(path.dirname(finalPath));
      expect(names.filter((name) => name.endsWith(".tmp"))).toEqual([]);
      await expect(mergeMinuteMonth("WIPRO", "2026-05", [
        { date: "2026-05-04T03:45:00.000Z", open: 1, high: 1, low: 1, close: 1, volume: 1 },
      ], { from: "2026-05-01", to: "2026-05-04" })).rejects.toThrow(/2026-05-04/);
      expect(await readdir(path.join(root, "1m", "WIPRO")).then((entries) => entries.some((name) => name.startsWith("2026-05")))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.MARKET_FILES_DIR;
      else process.env.MARKET_FILES_DIR = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
});

function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    const day = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}
