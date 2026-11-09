import { describe, expect, it } from "vitest";
import { formatAvgDays, formatInr, formatProfitFactor, formatSample, formatWinRate, periodLabel, shortDate } from "./pnl-ui";

describe("money and period labels", () => {
  it("puts the sign before the rupee and refuses negative zero", () => {
    expect(formatInr(25.96, { sign: true })).toBe("+₹25.96");
    expect(formatInr(-10.29, { sign: true })).toBe("−₹10.29");
    expect(formatInr(-0)).toBe("₹0.00");
    expect(formatInr(-0.001)).toBe("₹0.00");
    expect(formatInr(0, { sign: true })).toBe("₹0.00");
    expect(formatInr(80000, { digits: 2 })).toBe("₹80,000.00");
  });

  it("labels days, ISO weeks and months in words", () => {
    expect(shortDate("2026-11-09")).toBe("9 Nov");
    expect(periodLabel("day", "2026-11-09")).toBe("Mon, 9 Nov");
    expect(periodLabel("week", "2026-W46")).toBe("9–13 Nov");
    expect(periodLabel("month", "2026-11")).toBe("Nov 2026");
    expect(periodLabel("all", "All")).toBe("All");
    expect(periodLabel("week", "2026-W46")).not.toContain("W46");
    expect(periodLabel("month", "2026-11")).not.toContain("2026-11");
  });

  it("hides zero noise on the stat cards", () => {
    expect(formatWinRate(0, 0)).toBe("0%");
    expect(formatWinRate(0.5, 2)).toBe("50.0%");
    expect(formatProfitFactor(0, 0)).toBe("—");
    expect(formatProfitFactor(null, 3)).toBe("∞");
    expect(formatProfitFactor(1.5, 2)).toBe("1.50");
    expect(formatSample(0, "₹10.00")).toBe("—");
    expect(formatSample(2, "₹10.00")).toBe("₹10.00");
    expect(formatAvgDays(0, [{ intraday: true }, { intraday: true }])).toBe("Same day");
    expect(formatAvgDays(1.5, [{ intraday: false }])).toBe("1.5");
    expect(formatAvgDays(0, [])).toBe("0.0");
  });
});
