import { describe, expect, it } from "vitest";
import { passedIntradayStrategies } from "./research-ready";

describe("intraday research passes", () => {
  it("counts a strategy only when both samples passed", () => {
    expect(passedIntradayStrategies([
      { strategy: "orb", sample: "building", passed: true },
      { strategy: "orb", sample: "heldback", passed: true },
      { strategy: "vwap", sample: "building", passed: true },
      { strategy: "vwap", sample: "heldback", passed: false },
    ])).toBe(1);
  });

  it("ignores an older failed run once a later one passed", () => {
    expect(passedIntradayStrategies([
      { strategy: "orb", sample: "building", passed: true },
      { strategy: "orb", sample: "building", passed: false },
      { strategy: "orb", sample: "heldback", passed: true },
    ])).toBe(1);
  });

  it("is waiting when nothing has passed both samples", () => {
    expect(passedIntradayStrategies([
      { strategy: "orb", sample: "building", passed: true },
    ])).toBe(0);
  });
});
