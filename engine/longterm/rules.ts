/**
 * Owner decisions recorded on 2026-11-18, before any held-back Long Game sample is loaded.
 * Targets, signals and costs stay at the v1 frozen values.
 */
export const LONGTERM_FROZEN_V2 = {
  version: "longgame-frozen-v2",
  decidedOn: "2026-11-18",
  decider: "owner",
  eventsPerYearMax: 12,
  concentrationMaxShare: 0.5,
  cagrGapPoints: 2,
  targetsUnchanged: true,
  signalsUnchanged: true,
  costsUnchanged: true,
  concentrationOverride: {
    effect: "authorizes one held-back test",
    convertsFailToPass: false,
  },
  reasons: {
    eventsPerYear:
      "The owner judges about eight allocation changes a year acceptable for a market-adaptive ETF book, so the gate moves from at most six events a year to at most twelve.",
    afterTax:
      "The CAGR gap of two percentage points must hold on the current-tax stress CAGR as well as on the pre-tax CAGR.",
    concentration:
      "The 50% concentration gate is unchanged and still fails when one sleeve or one year dominates. The owner authorizes one held-back inspection despite that failure. The override never converts the check from fail to pass.",
    unchanged: "Targets, signals, and costs are unchanged.",
  },
} as const;

export const CORRECTED_BUILDING_LINK = {
  supersedesRunIds: [9, 10] as const,
  reason:
    "Gold BeES 1:100 split effective 2019-12-19 was stored as an unadjusted NAV drop. This building run replaces runs 9 and 10 after that corporate action is normalized. Targets, signals, and costs are unchanged.",
};
