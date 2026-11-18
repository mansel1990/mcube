import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { equityPeriods, halfYearAccount, legacyHalfYearLabel, scoreResearch, diagnosticIntradayWindow, commonCoverageStart, assertIntradaySampleEnd, assertNoHeldbackIntradayCandle, sampleWindow } from "@/lib/mlive/research-bar";
import { isParkedResearch, PARKED_RESEARCH, storedHalfYears, verdictFor } from "@/lib/mlive/research-page";
import { parseResearchArgs } from "./backtest/args";
import { profitFactorDroppingLargest, winnerShare } from "./backtest/stress";
import { simulateIntraday } from "./backtest/intraday";
import { vwapStrategy } from "./strategies/vwap";
import { jobHeapMb, takeHeapFlag } from "./research-spawn";
import { momentumEodPlan, momentumSellWatchShouldRun } from "./momentum-live";
import { backfillThrough, formatCoverage, minuteImportMayStart, minuteImportMustStop, minuteProvenance, missingSessions, reliableCoverageStart } from "./jobs/market-window";

describe("half-year accounting", () => {
  const equity = [
    { date: "2024-06-28", value: 90000 },
    { date: "2024-12-31", value: 88000 },
    { date: "2025-06-30", value: 91000 },
    { date: "2025-12-31", value: 93000 },
    { date: "2026-06-30", value: 95000 },
    { date: "2026-11-17", value: 94000 },
  ];

  it("keeps the open half-year out of the complete ratio", () => {
    const periods = equityPeriods(equity, 80000, "2024-01-01", "2026-11-17", "half");
    const account = halfYearAccount(periods);
    expect(account.complete.map((period) => period.key)).toEqual(["2024-H1", "2024-H2", "2025-H1", "2025-H2", "2026-H1"]);
    expect(account.incomplete.map((period) => period.key)).toEqual(["2026-H2"]);
    expect(account.incomplete[0]?.complete).toBe(false);
    expect(account.label).toBe("4 of 5 complete half-years");
    expect(account.label).not.toBe(legacyHalfYearLabel(50));
    expect(legacyHalfYearLabel(50)).toBe("5/10");
  });

  it("labels a stored curve without calling the open half-year one of ten", () => {
    const stored = storedHalfYears(equity, 80000, "2024-01-01", "2026-11-17");
    expect(stored?.label).toBe("Profitable 4 of 5 complete half-years");
    expect(stored?.incomplete).toMatch(/2026-H2 is incomplete/);
    expect(stored?.pct).toBeCloseTo(80);
  });
});

describe("building and held-back stay separate", () => {
  it("does not give a diagnostic or a held-back window the building label", () => {
    expect(sampleWindow("swing", "building", null)).toEqual({ from: "2019-01-01", to: "2023-12-31" });
    expect(sampleWindow("swing", "heldback", "2026-11-17").from).toBe("2024-01-01");
    expect(sampleWindow("intraday", "diagnostic", null)).toEqual({ from: "2024-11-18", to: "2026-04-30" });
    expect(sampleWindow("intraday", "heldback", "2026-11-17").from).toBe("2026-05-01");
    expect(diagnosticIntradayWindow("2025-11-03")).toEqual({ from: "2025-11-03", to: "2026-04-30" });
    expect(() => assertIntradaySampleEnd("building", { to: "2026-11-17" })).toThrow(/2026-04-30/);
    expect(() => assertIntradaySampleEnd("diagnostic", { to: "2026-04-30" })).not.toThrow();
  });
});

describe("winner concentration", () => {
  const trades = [
    { symbol: "AAA", net: 500 },
    { symbol: "BBB", net: 300 },
    { symbol: "CCC", net: 200 },
    { symbol: "DDD", net: 100 },
    { symbol: "EEE", net: 50 },
    { symbol: "FFF", net: -400 },
  ];

  it("reports the largest winners' share and the profit factor after they are removed", () => {
    const one = winnerShare(trades, 1);
    expect(one.symbols).toEqual(["AAA"]);
    expect(one.share).toBeCloseTo(500 / 750);
    expect(profitFactorDroppingLargest(trades.map((trade) => trade.net), 1)).toBeCloseTo(650 / 400);
    expect(profitFactorDroppingLargest(trades.map((trade) => trade.net), 3)).toBeCloseTo(150 / 400);
    expect(winnerShare(trades, 5).symbols).toEqual(["AAA", "BBB", "CCC", "DDD", "EEE"]);
  });
});

describe("parked momentum", () => {
  it("is research only and is not described as live", () => {
    expect(isParkedResearch("swing", "momentum", "M10-6")).toBe(true);
    expect(isParkedResearch("swing", "momentum", "M10-10")).toBe(false);
    expect(PARKED_RESEARCH).toBe("Parked · research only");
    expect(verdictFor({
      book: "swing",
      runs: 1,
      sample: "heldback",
      rows: [{ name: "Momentum XI — Anchor", passed: true, fails: 0, parked: true }],
    }).text).toMatch(/Parked · research only/);
    expect(verdictFor({
      book: "swing",
      runs: 1,
      sample: "heldback",
      rows: [{ name: "Momentum XI — Anchor", passed: true, fails: 0, parked: true }],
    }).text).not.toMatch(/passed/);
  });

  it("creates no entries when momentum is off and still plans exits and the sell watcher", () => {
    expect(momentumEodPlan({ entriesEnabled: false, weeklySignalDay: true })).toEqual({
      formCohort: false,
      writeIdeas: false,
      buyDecisions: false,
      proposeWeeklyExits: true,
      sellWatch: true,
    });
    expect(momentumEodPlan({ entriesEnabled: true, weeklySignalDay: true }).writeIdeas).toBe(true);
    expect(momentumSellWatchShouldRun(20 * 60 + 40)).toBe(false);
    expect(momentumSellWatchShouldRun(10 * 60)).toBe(true);
    const source = readFileSync(new URL("./jobs/momentum-eod.ts", import.meta.url), "utf8");
    expect(source).toMatch(/momentum entries parked/);
    expect(source).toMatch(/proposeWeeklyExits/);
    expect(source).toMatch(/maintainMomentumWeeklySells/);
    expect(source).not.toMatch(/side, 'BUY'/);
  });
});

describe("research cannot write orders", () => {
  it("keeps the research path away from order tables", () => {
    for (const file of [
      "jobs/research.ts",
      "jobs/research-queue.ts",
      "jobs/longterm-import.ts",
      "backtest/run.ts",
      "backtest/args.ts",
      "longterm/run.ts",
      "longterm/verify.ts",
      "longterm/heldback.ts",
      "longterm/data.ts",
    ]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      for (const forbidden of [
        "mlive_orders",
        "mlive_ideas",
        "mlive_decisions",
        "mlive_gtts",
        "mlive_positions",
        "strategies_enabled",
        "placeOrder",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
    const queue = readFileSync(new URL("./jobs/research-queue.ts", import.meta.url), "utf8");
    expect(queue).toMatch(/longterm" && row\.sample === "heldback"/);
    const route = readFileSync(new URL("../app/api/mlive/long-term/route.ts", import.meta.url), "utf8");
    const view = readFileSync(new URL("../components/mlive/long-term-view.tsx", import.meta.url), "utf8");
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/);
    expect(view).not.toMatch(/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/);
    expect(view).not.toMatch(/onClick=\{[^}]*fetch\([^)]*method:\s*["']POST/);
  });
});

describe("intraday diagnostic", () => {
  it("cannot pass and cannot read a held-back candle", async () => {
    const score = scoreResearch({
      book: "intraday",
      sample: "diagnostic",
      nets: [10, 10, 10],
      netPcts: [1, 1, 1],
      monthly: { "2025-11": 5 },
      equity: [100, 110],
      equityStart: 100,
      equityEnd: 110,
      windowFrom: "2025-11-03",
      windowTo: "2026-04-30",
    });
    expect(score.passed).toBe(false);
    expect(score.failReasons).toEqual([]);
    expect(() => assertNoHeldbackIntradayCandle("diagnostic", "2026-05-01")).toThrow(/held-back/);
    expect(() => assertNoHeldbackIntradayCandle("building", "2026-04-30")).not.toThrow();
    await expect(simulateIntraday({
      strategies: [vwapStrategy],
      grid: false,
      sample: "building",
      window: { from: "2026-04-01", to: "2026-05-02" },
      rules: { capital: 80000, riskPct: 0.01, leverage: 1, maxTrades: 4, dayLossPct: 0.02, short: false },
      slip: 0.001,
      tick: new Map([["AAA", 0.05]]),
      exitTime: "15:00",
      entryAfter: "09:20",
      stream: async () => undefined,
      orbSymbols: [],
      vwapSymbols: ["AAA"],
      daily: async () => [{ t: "2026-04-01", o: 100, h: 101, l: 99, c: 100, v: 1 }],
    })).rejects.toThrow(/2026-05-02/);
    expect(parseResearchArgs(["--book", "intraday", "--sample", "diagnostic", "--no-grid", "--strategy", "vwap"]).sample).toBe("diagnostic");
    expect(verdictFor({ book: "intraday", runs: 1, sample: "diagnostic", rows: [{ name: "VWAP", passed: true, fails: 0 }] }).text).toMatch(/No official pass or fail/);
  });

  it("does not invent a common start when a symbol is missing", () => {
    expect(commonCoverageStart(["2025-11-03", null]).start).toBeNull();
    expect(commonCoverageStart(["2025-11-03", "2025-12-01"]).start).toBe("2025-12-01");
  });
});

describe("one-minute backfill", () => {
  it("stops outside the research window and reports missing sessions", () => {
    expect(minuteImportMayStart(16 * 60 + 30)).toBe(true);
    expect(minuteImportMayStart(7 * 60)).toBe(true);
    expect(minuteImportMayStart(7 * 60 + 30)).toBe(false);
    expect(minuteImportMustStop(16 * 60 + 30)).toBe(false);
    expect(minuteImportMustStop(7 * 60 + 54)).toBe(false);
    expect(minuteImportMustStop(7 * 60 + 55)).toBe(true);
    expect(minuteImportMustStop(18 * 60)).toBe(true);
    expect(backfillThrough("2025-11-03")).toBe("2025-11-02");
    expect(backfillThrough(null)).toBe("2026-04-30");
    expect(backfillThrough("2024-11-18")).toBeNull();
    expect(reliableCoverageStart(["2025-11-03", "2025-11-10"])).toBe("2025-11-10");
    expect(reliableCoverageStart(["2025-11-03", null])).toBeNull();
    const missing = missingSessions(["2024-11-18", "2024-11-19"], new Set(["2024-11-18"]));
    expect(formatCoverage([{ symbol: "INFY", sessions: 1, missing }])).toMatch(/INFY sessions 1 missing 1: 2024-11-19/);
    const provenance = minuteProvenance({
      symbol: "INFY",
      month: "2024-11",
      from: "2024-11-18",
      to: "2024-11-29",
      rows: 2,
      csv: "ts_ist,open,high,low,close,volume\n",
      retrievedAt: "2026-11-18T00:00:00.000Z",
    });
    expect(provenance.source).toBe("kite.historical");
    expect(provenance.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("gives the manual swing run a heap override and leaves the queue at 600", () => {
    const taken = takeHeapFlag(["node", "engine/cli.ts", "research", "--heap", "2200", "--book", "swing"]);
    expect(taken.heapMb).toBe(2200);
    expect(taken.argv).not.toContain("--heap");
    expect(jobHeapMb("research", 2200, false)).toBe(2200);
    expect(jobHeapMb("research-queue", 2200, false)).toBe(600);
    expect(jobHeapMb("market-backfill", null, true)).toBe(600);
    expect(jobHeapMb("market-daily", null, false)).toBeNull();
  });
});
