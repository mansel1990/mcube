import { describe, expect, it } from "vitest";
import { recentMarketDays } from "./calendar";

describe("recent market days", () => {
  it("is the last 7 market days, newest first, including a day with no trades", () => {
    const days = recentMarketDays("2026-11-17", 7, new Set());
    expect(days).toEqual([
      "2026-11-17",
      "2026-11-16",
      "2026-11-13",
      "2026-11-12",
      "2026-11-11",
      "2026-11-10",
      "2026-11-09",
    ]);
  });
});
