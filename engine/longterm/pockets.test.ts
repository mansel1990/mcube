import { describe, expect, it } from "vitest";
import {
  allocateIncomeUnits,
  closeFifo,
  openingContribution,
  reductionAttribution,
  registrationError,
  remainingUnassigned,
  swingScopedCost,
  swingScopedPending,
} from "./pockets";

describe("Long Game pockets stay out of Swing", () => {
  const swing = { book: "swing", qty: 10, avg: 100 };
  const longGame = { book: "longterm", qty: 40, avg: 250 };
  const intraday = { book: "intraday", qty: 5, avg: 20 };

  it("ignores Long Game holdings, deposits and pending orders", () => {
    expect(swingScopedCost([swing])).toBe(1000);
    expect(swingScopedCost([swing, longGame, intraday, { book: null, qty: 2, avg: 50 }])).toBe(1100);
    expect(swingScopedPending([
      { book: "swing", notional: 8000 },
      { book: "longterm", notional: 100000 },
      { book: null, notional: 500 },
    ])).toBe(8500);
  });
});

describe("opening holdings and reconciliation", () => {
  it("rejects a registration above the unassigned Kite units and books original cost with no cash", () => {
    expect(remainingUnassigned(140, 100)).toBe(40);
    expect(registrationError(41, 40)).toMatch(/unassigned/);
    expect(registrationError(40, 40)).toBeNull();
    expect(openingContribution(40, 210.5)).toEqual({ moneyAdded: 8420, cash: 0 });
  });

  it("does not guess which pocket sold when both own the ETF", () => {
    expect(reductionAttribution([{ pocket: "core", units: 100 }, { pocket: "radar", units: 0 }])).toEqual({
      preselect: "core",
      needsSplit: false,
    });
    expect(reductionAttribution([{ pocket: "core", units: 100 }, { pocket: "radar", units: 40 }])).toEqual({
      preselect: null,
      needsSplit: true,
    });
  });

  it("splits liquid dividend units in whole units and audits the remainder", () => {
    const split = allocateIncomeUnits(2, 1, 2);
    expect(split.core + split.radar).toBe(2);
    expect(split.core).toBe(1);
    expect(split.radar).toBe(1);
    expect(split.note).toContain("Incoming 2");
    expect(allocateIncomeUnits(0, 0, 3).core).toBe(0);
  });

  it("closes the oldest lot first and keeps the original cost", () => {
    const closed = closeFifo(
      [
        { id: 2, qty: 10, price: 200, acquiredOn: "2025-11-01" },
        { id: 1, qty: 10, price: 100, acquiredOn: "2020-01-01" },
      ],
      12,
      150,
      "2026-01-02",
    );
    expect(closed.closed.map((row) => [row.id, row.qty, row.term])).toEqual([
      [1, 10, "long"],
      [2, 2, "short"],
    ]);
    expect(closed.realised).toBe(10 * 50 + 2 * -50);
    expect(closed.unfilled).toBe(0);
  });
});
