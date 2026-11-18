import { LONGTERM_FROZEN_V2 } from "./rules";

export type AcceptanceComparison = {
  radar: "RADAR-NEXT" | "RADAR-MID";
  benchmark: "STATIC-NEXT" | "STATIC-MID";
  checks: {
    drawdownReduction: boolean;
    cagrGap: boolean;
    afterTaxCagrGap: boolean;
    positiveFiveYearWindows: boolean;
    fasterRecovery: boolean;
    eventsPerYear: boolean;
    stressDrawdownAdvantage: boolean;
    diversifiedProfit: boolean;
  };
  qualified: boolean;
  details: Record<string, number | string | boolean | null>;
};

export type LongtermV2ScoreInput = {
  variant: string;
  cagrPct: number;
  maxDrawdownPct: number;
  recoveryDate: string | null;
  daysUnderwater: number;
  positiveFiveYearPct: number;
  eventsPerYear: number;
  doubledCostDrawdownPct: number;
  doubledDragDrawdownPct: number;
  afterTaxCagrPct: number | null;
  contributionApprox: Record<string, number>;
  calendarYearReturns: Record<string, number>;
};

export function sleeveDisplayName(variant: string, sleeve: string): string {
  if (sleeve === "nifty50") return "Nifty 50";
  if (sleeve === "gold") return "Gold";
  if (sleeve === "liquid") return "Liquid";
  if (sleeve === "secondary") return variant.endsWith("MID") ? "Midcap 150" : "Next 50";
  return sleeve;
}

export function concentratedSleeve(variant: string, contribution: Record<string, number>): { sleeve: string; name: string; share: number } {
  const sleeves = ["nifty50", "secondary", "gold", "liquid"];
  const positive = sleeves.map((sleeve) => ({ sleeve, value: Math.max(0, Number(contribution[sleeve]) || 0) }));
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  const largest = positive.reduce((best, row) => (row.value > best.value ? row : best), positive[0]);
  return {
    sleeve: largest.sleeve,
    name: sleeveDisplayName(variant, largest.sleeve),
    share: total > 0 ? largest.value / total : 1,
  };
}

export function liveDesignConclusion(qualified: boolean): "qualifies for live design" | "does not qualify" {
  return qualified ? "qualifies for live design" : "does not qualify";
}

export function longtermV2InputFromStored(variant: string, metrics: unknown, stress: unknown): LongtermV2ScoreInput {
  const metric = record(metrics);
  const drawdown = record(metric.maxDrawdown);
  const stresses = record(stress);
  const doubledCosts = record(stresses.doubledCosts);
  const doubledDrag = record(stresses.doubledDrag);
  const currentTax = record(stresses.currentTax);
  return {
    variant,
    cagrPct: finite(metric.cagrPct) ?? 0,
    maxDrawdownPct: finite(drawdown.pct) ?? 0,
    recoveryDate: typeof drawdown.recoveryDate === "string" ? drawdown.recoveryDate : null,
    daysUnderwater: finite(drawdown.daysUnderwater) ?? Number.POSITIVE_INFINITY,
    positiveFiveYearPct: finite(metric.positiveRollingFiveYearPct) ?? 0,
    eventsPerYear: finite(metric.eventsPerYear) ?? Number.POSITIVE_INFINITY,
    doubledCostDrawdownPct: finite(record(doubledCosts.maxDrawdown).pct) ?? Number.POSITIVE_INFINITY,
    doubledDragDrawdownPct: finite(record(doubledDrag.maxDrawdown).pct) ?? Number.POSITIVE_INFINITY,
    afterTaxCagrPct: finite(currentTax.cagrPct),
    contributionApprox: numberRecord(metric.contributionApprox),
    calendarYearReturns: numberRecord(metric.calendarYearReturns),
  };
}

/** Scores stored or freshly simulated metrics. Concentration stays failed when the 50% gate is missed. */
export function scoreLongtermV2(radar: LongtermV2ScoreInput, benchmark: LongtermV2ScoreInput): AcceptanceComparison {
  const expected = radar.variant === "RADAR-NEXT" ? "STATIC-NEXT" : radar.variant === "RADAR-MID" ? "STATIC-MID" : "";
  if (!expected || benchmark.variant !== expected) {
    throw new Error(`${radar.variant} must be compared only with ${expected || radar.variant.replace("RADAR", "STATIC")}.`);
  }
  const radarRecovery = radar.recoveryDate ? radar.daysUnderwater : Number.POSITIVE_INFINITY;
  const staticRecovery = benchmark.recoveryDate ? benchmark.daysUnderwater : Number.POSITIVE_INFINITY;
  const asset = concentratedSleeve(radar.variant, radar.contributionApprox);
  const positiveYears = Object.values(radar.calendarYearReturns).map((value) => Math.max(0, value));
  const yearTotal = positiveYears.reduce((sum, value) => sum + value, 0);
  const largestPeriodShare = yearTotal > 0 ? Math.max(...positiveYears) / yearTotal : 1;
  const afterTaxKnown = radar.afterTaxCagrPct != null && benchmark.afterTaxCagrPct != null;
  const checks = {
    drawdownReduction: radar.maxDrawdownPct <= benchmark.maxDrawdownPct * 0.85,
    cagrGap: radar.cagrPct >= benchmark.cagrPct - LONGTERM_FROZEN_V2.cagrGapPoints,
    afterTaxCagrGap: afterTaxKnown && radar.afterTaxCagrPct! >= benchmark.afterTaxCagrPct! - LONGTERM_FROZEN_V2.cagrGapPoints,
    positiveFiveYearWindows: radar.positiveFiveYearPct >= 80,
    fasterRecovery: radarRecovery < staticRecovery,
    eventsPerYear: radar.eventsPerYear <= LONGTERM_FROZEN_V2.eventsPerYearMax,
    stressDrawdownAdvantage:
      radar.doubledCostDrawdownPct < benchmark.doubledCostDrawdownPct
      && radar.doubledDragDrawdownPct < benchmark.doubledDragDrawdownPct,
    diversifiedProfit: asset.share <= LONGTERM_FROZEN_V2.concentrationMaxShare && largestPeriodShare <= LONGTERM_FROZEN_V2.concentrationMaxShare,
  };
  return {
    radar: radar.variant as "RADAR-NEXT" | "RADAR-MID",
    benchmark: benchmark.variant as "STATIC-NEXT" | "STATIC-MID",
    checks,
    qualified: Object.values(checks).every(Boolean),
    details: {
      radarDrawdownPct: radar.maxDrawdownPct,
      staticDrawdownPct: benchmark.maxDrawdownPct,
      radarCagrPct: radar.cagrPct,
      staticCagrPct: benchmark.cagrPct,
      afterTaxRadarCagrPct: radar.afterTaxCagrPct,
      afterTaxStaticCagrPct: benchmark.afterTaxCagrPct,
      positiveFiveYearPct: radar.positiveFiveYearPct,
      radarRecoveryDays: Number.isFinite(radarRecovery) ? radarRecovery : null,
      staticRecoveryDays: Number.isFinite(staticRecovery) ? staticRecovery : null,
      eventsPerYear: radar.eventsPerYear,
      eventsPerYearLimit: LONGTERM_FROZEN_V2.eventsPerYearMax,
      largestAssetProfitSharePct: asset.share * 100,
      largestPositiveYearSharePct: largestPeriodShare * 100,
      concentratedSleeve: asset.name,
      rulesVersion: LONGTERM_FROZEN_V2.version,
      concentrationOverride: "inspection-only",
      concentrationConvertsFailToPass: false,
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberRecord(value: unknown): Record<string, number> {
  const source = record(value);
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, finite(item) ?? 0]));
}
