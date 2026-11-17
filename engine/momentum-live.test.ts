import { describe, expect, it } from "vitest";
import { grossAllows, sizeMomentumOrder } from "./live-portfolio";
import { M10_6_POLICY, liveSwingPolicy, requiresProtectiveGtt } from "./live-strategies";
import { indexAboveAverage, isWeeklySignalDay, momentumCohortAction, momentumCohortIsCurrent, selectMomentumCohort } from "./momentum-live";

describe("live M10-6 policy", () => {
  it("freezes the tested sizing and book limits", () => {
    expect(liveSwingPolicy("momentum", { maxOrderPct: 0.25, minOrderInr: 8_000, maxOpen: 6 })).toEqual(M10_6_POLICY);
    expect(M10_6_POLICY).toMatchObject({
      maxOrderPct: 0.1,
      minOrderInr: 4_000,
      maxOpen: 6,
      maxGrossExposurePct: 0.6,
      priceStop: false,
    });
  });

  it("sizes to 10% of marked equity and reserves buy charges", () => {
    const roomy = sizeMomentumOrder({
      equity: 80_000,
      entry: 100,
      spendable: 20_000,
      maxOrderPct: 0.1,
      minOrderInr: 4_000,
    });
    expect(roomy.qty).toBe(80);
    expect(roomy.notional).toBe(8_000);

    const chargeBound = sizeMomentumOrder({
      equity: 80_000,
      entry: 100,
      spendable: 8_000,
      maxOrderPct: 0.1,
      minOrderInr: 4_000,
    });
    expect(chargeBound.qty).toBe(79);
    expect(chargeBound.notional).toBe(7_900);

    expect(sizeMomentumOrder({
      equity: 30_000,
      entry: 100,
      spendable: 20_000,
      maxOrderPct: 0.1,
      minOrderInr: 4_000,
    }).reason).toBe("too_small");
  });

  it("uses a 60% entry gate without forcing sales after appreciation", () => {
    expect(grossAllows(40_000, 0, 8_000, 80_000, 0.6)).toBe(true);
    expect(grossAllows(40_001, 0, 8_000, 80_000, 0.6)).toBe(false);
  });

  it("treats momentum's missing GTT as intentional", () => {
    expect(requiresProtectiveGtt("momentum")).toBe(false);
    expect(requiresProtectiveGtt("ema")).toBe(true);
  });
});

describe("live momentum weekly timing", () => {
  it("recognises normal and holiday-shortened week ends", () => {
    expect(isWeeklySignalDay("2026-11-20", "2026-11-23")).toBe(true);
    expect(isWeeklySignalDay("2026-11-19", "2026-11-23")).toBe(true);
    expect(isWeeklySignalDay("2026-11-17", "2026-11-18")).toBe(false);
  });

  it("does not manufacture a cohort when first enabled midweek", () => {
    expect(momentumCohortAction({ enabled: true, weeklySignalDay: false, alreadyProcessed: false })).toBe("carry");
    expect(momentumCohortAction({ enabled: true, weeklySignalDay: true, alreadyProcessed: false })).toBe("form");
    expect(momentumCohortAction({ enabled: true, weeklySignalDay: true, alreadyProcessed: true })).toBe("carry");
  });

  it("carries a cohort only through its intended trading week", () => {
    expect(momentumCohortIsCurrent("2026-11-20", "2026-11-20", "2026-11-23")).toBe(true);
    expect(momentumCohortIsCurrent("2026-11-20", "2026-11-25", "2026-11-23")).toBe(true);
    expect(momentumCohortIsCurrent("2026-11-20", "2026-11-30", "2026-11-23")).toBe(false);
  });

  it("requires 200 complete index closes and a strict close above the average", () => {
    expect(indexAboveAverage(Array(199).fill(100), 200)).toBe(false);
    expect(indexAboveAverage([...Array(199).fill(100), 101], 200)).toBe(true);
    expect(indexAboveAverage(Array(200).fill(100), 200)).toBe(false);
  });

  it("ranks first and then applies clean-data eligibility without promoting rank nine", () => {
    const points = Array.from({ length: 10 }, (_, index) => ({
      symbol: `S${index + 1}`,
      return90: 1 - index / 10,
      signalClose: 100,
      sector: `Sector${index}`,
      eligible: index !== 2,
    }));
    const cohort = selectMomentumCohort(points, true);
    expect(cohort.map((row) => row.symbol)).toEqual(["S1", "S2", "S4", "S5", "S6", "S7", "S8"]);
    expect(cohort.some((row) => row.symbol === "S9")).toBe(false);
    expect(selectMomentumCohort(points, false)).toEqual([]);
  });
});
