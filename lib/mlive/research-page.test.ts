import { describe, expect, it } from "vitest";
import { researchThresholds } from "./research-bar";
import {
  aboutRun,
  alreadyRunMessage,
  bandCounts,
  changeNote,
  duplicateBlock,
  makeIdentity,
  overlapLines,
  passRows,
  progressLine,
  queueBlock,
  identityFromRun,
  readIdentity,
  rebaseToCapital,
  researchStartLine,
  resultBand,
  robustnessLabel,
  runSummary,
  sampleSpan,
  sortStrategies,
  verdictFor,
  type StoredRun,
} from "./research-page";

const bar = researchThresholds("swing", "building");

function identity(over: Partial<Parameters<typeof makeIdentity>[0]> = {}) {
  return makeIdentity({
    book: "swing",
    sample: "building",
    strategies: ["rs", "ema"],
    grid: true,
    engineSha: "abc1234",
    lastCandle: "2026-11-14",
    ...over,
  });
}

function stored(over: Partial<StoredRun> & { identity?: ReturnType<typeof identity> | null }): StoredRun {
  return {
    id: 1,
    status: "ok",
    finishedAt: "2026-11-17T06:41:00.000Z",
    identity: identity(),
    ...over,
  };
}

describe("research run identity", () => {
  it("treats strategy order as the same run", () => {
    expect(identity({ strategies: ["ema", "rs"] })).toEqual(identity({ strategies: ["rs", "ema"] }));
  });

  it("normalises variant order and keeps different variant sets distinct", () => {
    expect(identity({ variants: ["M10-8", "M15-control"] })).toEqual(identity({ variants: ["M15-control", "M10-8"] }));
    expect(duplicateBlock(identity({ variants: ["M10-8"] }), [stored({})], false)).toBeNull();
  });

  it("refuses an ok run with the same code and data", () => {
    const message = duplicateBlock(identity(), [stored({})], false);
    expect(message).toBe(alreadyRunMessage("2026-11-17T06:41:00.000Z"));
    expect(message).toMatch(/Already run on 17 Nov/);
    expect(message).toMatch(/Results won't change/);
  });

  it("allows the run again when the code or the data changed, and says which", () => {
    const prior = [stored({})];
    expect(duplicateBlock(identity({ engineSha: "def5678" }), prior, false)).toBeNull();
    expect(changeNote(identity({ engineSha: "def5678" }), prior)).toMatch(/engine code changed since 17 Nov/);
    expect(changeNote(identity({ lastCandle: "2026-11-16" }), prior)).toMatch(/candle data changed since 17 Nov/);
    expect(changeNote(identity({ engineSha: "def5678", lastCandle: "2026-11-16" }), prior)).toMatch(/code and the candle data changed/);
  });

  it("lets --force through and ignores the run being checked", () => {
    expect(duplicateBlock(identity(), [stored({})], true)).toBeNull();
    expect(duplicateBlock(identity(), [stored({ id: 4 })], false, 4)).toBeNull();
  });

  it("does not treat a different strategy set or a missing code version as a duplicate", () => {
    expect(duplicateBlock(identity({ strategies: ["rsi2"] }), [stored({})], false)).toBeNull();
    expect(duplicateBlock(identity({ engineSha: "unknown" }), [stored({})], false)).toBeNull();
    expect(changeNote(identity({ engineSha: "unknown" }), [])).toMatch(/could not be read/);
  });

  it("reads an older run that stored the pieces but not the identity object", () => {
    const prior = stored({
      identity: null,
    });
    const rebuilt = {
      ...prior,
      identity: null,
    };
    expect(duplicateBlock(identity(), [rebuilt], false)).toBeNull();
    const legacy = identityFromRun({
      book: "swing",
      sample: "building",
      engineSha: "abc1234",
      dataLast: "2026-11-14",
      params: { strategies: ["rs", "ema"], grid: true },
    });
    expect(duplicateBlock(identity(), [{ ...prior, identity: legacy }], false)).toMatch(/Already run on 17 Nov/);
  });

  it("blocks a second queued copy and reads a stored identity", () => {
    const queued = stored({ id: 8, status: "queued", identity: identity() });
    expect(queueBlock(identity(), [queued])).toMatch(/already queued/);
    expect(readIdentity({ identity: identity() })?.strategies).toEqual(["ema", "rs"]);
  });
});

describe("research page copy", () => {
  it("names the closest strategies when none have passed", () => {
    const verdict = verdictFor({
      book: "swing",
      runs: 1,
      sample: "building",
      rows: [
        { name: "RS Resilience", passed: false, fails: 2 },
        { name: "Trend breakout", passed: false, fails: 1 },
        { name: "Momentum", passed: false, fails: 4 },
      ],
    });
    expect(verdict.tone).toBe("open");
    expect(verdict.text).toBe(
      "No strategy has passed yet. Closest: Trend breakout (fails 1 of 5 tests) and RS Resilience (fails 2 of 5 tests).",
    );
  });

  it("points a pass at the held-back test and stays quiet before the first run", () => {
    expect(verdictFor({
      book: "swing",
      runs: 1,
      sample: "building",
      rows: [
        { name: "RS Resilience", passed: true, fails: 0 },
        { name: "EMA Pullback", passed: true, fails: 0 },
      ],
    }).text).toBe("2 strategies passed: RS Resilience and EMA Pullback. Next step: held-back test.");
    expect(verdictFor({ book: "swing", runs: 0, sample: null, rows: [] }).text).toBe("Building sample not run yet.");
    expect(verdictFor({ book: "intraday", runs: 0, sample: null, rows: [] }).text).toMatch(/Intraday has not been tested yet/);
  });

  it("puts failing tests first and marks them against the bar", () => {
    const rows = passRows({
      profitFactor: 1.88,
      trades: 200,
      halfYearsPct: 80,
      worstDrawdownPct: 25,
      avgNetPct: 1.2,
      bar,
      quarters: false,
    });
    expect(rows[0].text).toBe("Worst drawdown 25.0% ✗ needs ≤ 15%");
    expect(rows[1].text).toBe("Profit factor 1.88 ✓ needs 1.4");
    expect(rows.filter((row) => !row.pass)).toHaveLength(1);
  });

  it("sorts passed, then close, then failed, by profit factor", () => {
    const sorted = sortStrategies([
      { name: "Momentum", band: "failed" as const, profitFactor: 2 },
      { name: "Trend breakout", band: "close" as const, profitFactor: 1.2 },
      { name: "RS Resilience", band: "close" as const, profitFactor: 1.9 },
      { name: "EMA Pullback", band: "passed" as const, profitFactor: 1.5 },
    ]);
    expect(sorted.map((row) => row.name)).toEqual(["EMA Pullback", "RS Resilience", "Trend breakout", "Momentum"]);
    expect(bandCounts(sorted)).toEqual({ passed: 1, close: 2, failed: 1 });
    expect(resultBand(false, 2)).toBe("close");
    expect(resultBand(false, 3)).toBe("failed");
  });

  it("calls the grid robust only when every point stays near the default and on the same side of the bar", () => {
    expect(robustnessLabel(1.88, [1.7, 2.0], bar.profitFactor)).toBe("Robust across settings");
    expect(robustnessLabel(1.88, [1.3], bar.profitFactor)).toBe("Depends on one setting");
    expect(robustnessLabel(1.88, [2.2], bar.profitFactor)).toBe("Depends on one setting");
    expect(robustnessLabel(1.88, [], bar.profitFactor)).toBe("Default settings only");
  });

  it("writes overlap only for passed and close strategies, as a range", () => {
    const lines = overlapLines(
      [
        { strategy: "rs", name: "RS Resilience", band: "close" },
        { strategy: "trend_breakout", name: "Trend breakout", band: "passed" },
        { strategy: "momentum", name: "Momentum", band: "failed" },
      ],
      [
        { a: "rs", b: "trend_breakout", overlap: 0.55 },
        { a: "trend_breakout", b: "rs", overlap: 0.58 },
        { a: "rs", b: "momentum", overlap: 0.9 },
      ],
    );
    expect(lines).toEqual([
      "RS Resilience and Trend breakout lose on the same day 55–58% of the time. Under 50% is better for a pair.",
    ]);
  });

  it("keeps the about list to one fact a line", () => {
    const lines = aboutRun({
      book: "swing",
      sample: "building",
      window: { from: "2019-01-01", to: "2023-12-31" },
      strategies: ["rs", "ema"],
      capital: { fund: 80000, riskPct: 0.01, maxOrderPct: 0.25, maxNewBuys: 2, maxOpen: 6, maxPerSector: 2, gttGap: 0.03 },
    });
    expect(lines[0]).toBe("Building sample, 2019–2023.");
    expect(lines[2]).toMatch(/DP charge on sells, 0\.05% slippage/);
    expect(lines[3]).toBe("₹80,000, 1% risk, 25% per order, 2 buys a day, 6 open, 2 per sector.");
    expect(lines.some((line) => line.startsWith("RS buys"))).toBe(true);
    expect(lines.every((line) => !line.includes("\n"))).toBe(true);
  });

  it("describes when a run will start and how far it has got", () => {
    expect(researchStartLine(10 * 60)).toBe("Starts at 16:00");
    expect(researchStartLine(18 * 60)).toBe("Runs tonight after 20:00 on the server");
    expect(progressLine("queued", null, 18 * 60)).toBe("Queued for 20:00");
    expect(progressLine("running", { done: 230, total: 501 }, 21 * 60)).toBe("Running: 230 of 501 stocks");
    expect(sampleSpan("2019-01-01", "2023-12-31")).toBe("2019–2023");
    expect(runSummary({
      id: 1,
      at: "2026-11-17T06:41:00.000Z",
      from: "2019-01-01",
      to: "2023-12-31",
      sample: "building",
      symbols: 495,
    })).toBe("Run 1 · 17 Nov 12:11 · 2019–2023 building sample · 495 stocks");
  });

  it("rebases Nifty to the same starting capital", () => {
    const series = rebaseToCapital(
      [{ date: "2024-01-02", value: 80000 }, { date: "2024-01-03", value: 84000 }],
      [{ date: "2024-01-02", close: 20000 }, { date: "2024-01-03", close: 21000 }],
      80000,
    );
    expect(series[0].nifty).toBe(80000);
    expect(series[1].nifty).toBe(84000);
    expect(series[1].portfolio).toBe(84000);
  });
});
