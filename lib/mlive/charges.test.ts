import { describe, expect, it } from "vitest";
import { backfillDiff } from "./charges";

describe("backfillDiff", () => {
  it("matches a paisa, adjusts a small contract-note gap, and fails a wide one", () => {
    expect(backfillDiff(22.98, 22.98)).toBe("none");
    expect(backfillDiff(22.98, 22.97)).toBe("none");
    expect(backfillDiff(22.98, 22.85)).toBe("adjust");
    expect(backfillDiff(22.85, 22.98)).toBe("adjust");
    expect(backfillDiff(10, 9)).toBe("adjust");
    expect(backfillDiff(10000, 9950)).toBe("adjust");
    expect(backfillDiff(200, 198.99)).toBe("adjust");
    expect(backfillDiff(100, 98.5)).toBe("fail");
    expect(backfillDiff(10, 8.99)).toBe("fail");
    expect(backfillDiff(10000, 9800)).toBe("fail");
    expect(backfillDiff(0, 2)).toBe("fail");
    expect(backfillDiff(0, 0.5)).toBe("adjust");
  });
});
