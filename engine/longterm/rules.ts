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

/**
 * Owner decisions recorded on 2026-11-18 after run 15 failed the building gate.
 * v2 constants stay in place so earlier runs keep their original interpretation.
 * The override authorizes one held-back inspection. It does not turn a failed check into a pass.
 */
export const LONGTERM_FROZEN_V3 = {
  version: "longgame-frozen-v3",
  decidedOn: "2026-11-18",
  decider: "owner",
  core: "STATIC-MID",
  radar: "RADAR-MID",
  coreNeedsHeldback: false,
  convertsFailToPass: false,
  inspectionOnly: true,
  secondaryDefault: "mid",
  run15: {
    id: 15,
    failedBuildingGate: true,
    staticMidAfterTaxCagrPct: 11.28,
    radarMidAfterTaxCagrPct: 10.33,
    radarMidConcentrationPct: 43.9,
    staticMidBuildingDrawdownPct: 23.6,
    radarMidBuildingDrawdownPct: 12.4,
  },
  ownerReason:
    "Our philosophy caps a fall at about 15%, set before these results; STATIC's building drawdown was 23.6% and RADAR-MID's 12.4%.",
  originalFailedBuildingChecks: [
    "Run 15 failed the building gate.",
    "STATIC-MID building drawdown was 23.6%.",
    "The override does not convert any failed check to a pass.",
  ],
  radarActivation: {
    maxDrawdownPct: 15,
    mustBeatStaticDrawdown: true,
    sameRunVariants: ["STATIC-MID", "RADAR-MID"] as const,
  },
} as const;

export const CORRECTED_BUILDING_LINK = {
  supersedesRunIds: [9, 10] as const,
  reason:
    "Gold BeES 1:100 split effective 2019-12-19 was stored as an unadjusted NAV drop. This building run replaces runs 9 and 10 after that corporate action is normalized. Targets, signals, and costs are unchanged.",
};
