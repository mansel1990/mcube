import { describe, expect, it } from "vitest";
import { auditPhrase, comingUp, indexedReturns, marketLine, relativeLabel } from "./today-board";

describe("today presentation", () => {
  it("rebases series from the latest shared first date and hides an empty series", () => {
    const chart = indexedReturns([
      { id: "swing", points: [{ date: "2026-01-01", value: 100 }, { date: "2026-02-01", value: 110 }] },
      { id: "nifty", points: [{ date: "2026-02-01", value: 200 }, { date: "2026-03-01", value: 210 }] },
      { id: "longgame", points: [] },
    ], null);
    expect(chart.start).toBe("2026-02-01");
    expect(chart.lines.map((line) => line.id)).toEqual(["swing", "nifty"]);
    expect(chart.lines[0].points[0].pct).toBe(0);
    expect(chart.lines[1].points[1].pct).toBeCloseTo(5);
  });

  it("lists decisions and schedule rows without a zero long-game line", () => {
    const morning = comingUp({
      minutes: 8 * 60,
      longGameOn: false,
      decisions: [{ side: "SELL", symbol: "HEROMOTOCO", qty: 3, reason: "closed below its trend stop", auto: true }],
    });
    const evening = comingUp({ minutes: 19 * 60, longGameOn: false, decisions: [] });
    const rows = morning;
    expect(rows.some((row) => row.text.includes("Sell HEROMOTOCO · 3 shares · Auto"))).toBe(true);
    expect(evening.some((row) => row.text === "Save market data")).toBe(true);
    expect(evening.some((row) => row.text === "Momentum picks")).toBe(true);
    expect(rows.some((row) => /Long Game/.test(row.text))).toBe(false);
    expect(rows.length).toBeLessThanOrEqual(6);
  });

  it("uses the trading calendar for the market line and hides a missing comparison", () => {
    expect(marketLine({ trading: false, minutes: 10 * 60, nextSession: "20 Nov" })).toContain("next session");
    expect(marketLine({ trading: false, minutes: 10 * 60, nextSession: "" })).toBe("Market closed");
    expect(marketLine({ trading: true, minutes: 10 * 60, nextSession: "20 Nov" })).toBe("Market open");
    expect(relativeLabel(2.4)).toBe("+2.4 pp");
    expect(relativeLabel(null)).toBeNull();
    expect(auditPhrase("longgame.opening")).toBe("A holding was registered to Core");
    expect(auditPhrase("custom.action")).toBe("custom action");
  });
});
