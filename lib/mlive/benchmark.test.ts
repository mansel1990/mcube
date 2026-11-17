import { describe, expect, it } from "vitest";
import { benchmarkSlice, benchmarkThrough, rebaseNifty } from "./benchmark";

describe("benchmark", () => {
  it("does not count a deposit as a return", () => {
    const slice = benchmarkSlice(
      [{ date: "2026-11-02", value: 100 }, { date: "2026-11-03", value: 200 }],
      [{ date: "2026-11-03", deposit: 100, withdrawal: 0 }],
      [{ date: "2026-11-02", close: 100 }, { date: "2026-11-03", close: 100 }],
    );
    expect(slice.oursPct).toBeCloseTo(0, 6);
    expect(slice.niftyPct).toBeCloseTo(0, 6);
    expect(slice.daysAhead).toBe(0);
  });

  it("skips a holiday that has no Nifty close", () => {
    const slice = benchmarkSlice(
      [
        { date: "2026-11-06", value: 100 },
        { date: "2026-11-07", value: 150 },
        { date: "2026-11-09", value: 110 },
      ],
      [],
      [{ date: "2026-11-06", close: 100 }, { date: "2026-11-09", close: 110 }],
    );
    expect(slice.marketDays).toBe(1);
    expect(slice.oursPct).toBeCloseTo(10, 6);
    expect(slice.niftyPct).toBeCloseTo(10, 6);
  });

  it("counts the days we beat Nifty", () => {
    const slice = benchmarkSlice(
      [
        { date: "2026-11-02", value: 100 },
        { date: "2026-11-03", value: 110 },
        { date: "2026-11-04", value: 100 },
      ],
      [],
      [
        { date: "2026-11-02", close: 100 },
        { date: "2026-11-03", close: 101 },
        { date: "2026-11-04", close: 110 },
      ],
    );
    expect(slice.daysAhead).toBe(1);
    expect(slice.marketDays).toBe(2);
  });

  it("stops at the last close both series share", () => {
    expect(benchmarkThrough(
      [{ date: "2026-11-13", value: 100 }, { date: "2026-11-16", value: 99 }],
      [{ date: "2026-11-13", close: 100 }, { date: "2026-11-16", close: 101 }, { date: "2026-11-17", close: 102 }],
    )).toBe("2026-11-16");
  });

  it("rebases Nifty to the account value on the first shared day", () => {
    const line = rebaseNifty(
      [{ date: "2026-11-02", value: 80_000 }, { date: "2026-11-03", value: 81_000 }],
      [{ date: "2026-11-02", close: 24_000 }, { date: "2026-11-03", close: 24_240 }],
    );
    expect(line[0].value).toBeCloseTo(80_000, 4);
    expect(line[1].value).toBeCloseTo(80_800, 4);
  });
});
