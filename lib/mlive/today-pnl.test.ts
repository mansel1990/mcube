import { describe, expect, it } from "vitest";
import { closedDayMove, sessionMove, todayReading } from "./today-pnl";

describe("session move", () => {
  it("marks an overnight position against the previous close", () => {
    expect(sessionMove({
      realisedGross: 0,
      charges: 0,
      open: [{ qty: 2, baseline: 100, live: 110 }],
    })).toBe(20);
  });

  it("marks a position bought today against the fill", () => {
    expect(sessionMove({
      realisedGross: 0,
      charges: 0,
      open: [{ qty: 4, baseline: 250, live: 255 }],
    })).toBe(20);
  });

  it("adds realised P&L and subtracts today's charges", () => {
    expect(sessionMove({
      realisedGross: 50,
      charges: 8,
      open: [{ qty: 2, baseline: 100, live: 110 }],
    })).toBe(62);
  });

  it("leaves a leg unchanged when the live price is missing", () => {
    expect(sessionMove({
      realisedGross: 0,
      charges: 3,
      open: [{ qty: 1, baseline: 100, live: null }],
    })).toBe(-3);
  });
});

describe("today's reading", () => {
  it("labels yesterday and says the market is not open yet", () => {
    expect(todayReading({ beforeOpen: true, session: 80, yesterday: -303, base: 100000 })).toEqual({
      beforeOpen: true,
      label: "Yesterday",
      amount: -303,
      pct: -0.303,
      note: "Market not open yet",
    });
  });

  it("uses the session move once the market is open", () => {
    const reading = todayReading({ beforeOpen: false, session: 40, yesterday: -303, base: 80000 });
    expect(reading.label).toBe("today");
    expect(reading.amount).toBe(40);
    expect(reading.note).toBeNull();
    expect(reading.pct).toBeCloseTo(0.05, 6);
  });
});

describe("closed day move", () => {
  it("does not count a deposit as profit", () => {
    expect(closedDayMove(100500, 100000, 800, 0)).toBe(-300);
  });
});
