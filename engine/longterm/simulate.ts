import { createHash } from "node:crypto";
import {
  LONGTERM_BUILDING_FROM,
  LONGTERM_BUILDING_TO,
  LONGTERM_DATA_VERSION,
  type LongtermDataset,
  type LongtermSeriesKey,
} from "./data";
import {
  DEFAULT_LONGTERM_COSTS,
  DEFAULT_LONGTERM_DRAG,
  DEFAULT_LONGTERM_TAX,
  DEFAULT_REPRESENTATIVE_ETFS,
  LONGTERM_VARIANT_NAMES,
  getLongtermVariant,
  type LongtermCostConfig,
  type LongtermDragConfig,
  type LongtermTaxConfig,
  type LongtermVariant,
  type LongtermVariantName,
  type RepresentativeEtfConfig,
  type RiskySleeve,
  type Sleeve,
} from "./variants";

const RISKY: RiskySleeve[] = ["nifty50", "secondary", "gold"];
const SLEEVES: Sleeve[] = [...RISKY, "liquid"];
const DAY = 86_400_000;

export type LongtermSimulationOptions = {
  initialCapital?: number;
  costs?: Partial<LongtermCostConfig>;
  drag?: Partial<LongtermDragConfig>;
  tax?: PartialTaxConfig;
  riskFreeAnnual?: number;
  /** A pre-2024 subset used by focused deterministic tests; the public default is always the frozen sample. */
  window?: { from: string; to: string };
};

type PartialTaxConfig = {
  asOf?: string;
  equity?: Partial<LongtermTaxConfig["equity"]>;
  nonEquity?: Partial<LongtermTaxConfig["nonEquity"]>;
};

export type LongtermEvent = {
  signalDate: string;
  executionDate: string;
  sleeve: Sleeve | "portfolio";
  action: "BUY" | "SELL" | "REBALANCE";
  kind: "initial" | "annual" | "drift" | "stage" | "warning";
  stage?: 1 | 2 | 3;
  regime?: "normal" | "crisis";
  reason: string;
  gross: number;
  charges: number;
  slippage: number;
  tax: number;
  allocationAfter: Record<Sleeve, number>;
};

export type LongtermEquityPoint = { date: string; value: number; drawdownPct: number };

export type LongtermAllocationPoint = {
  date: string;
  value: number;
  values: Record<Sleeve, number>;
  weights: Record<Sleeve, number>;
};

export type ReturnPoint = { date: string; returnPct: number };

export type LongtermMetrics = {
  endingValue: number;
  cagrPct: number;
  maxDrawdown: {
    pct: number;
    peakDate: string;
    troughDate: string;
    recoveryDate: string | null;
    daysUnderwater: number;
  };
  calendarYearReturns: Record<string, number>;
  rollingReturns: { oneYear: ReturnPoint[]; threeYear: ReturnPoint[]; fiveYear: ReturnPoint[] };
  positiveRollingFiveYearPct: number;
  annualizedVolatilityPct: number;
  downsideDeviationPct: number;
  sharpe: number | null;
  sortino: number | null;
  riskFreeAnnualPct: number;
  turnoverPct: number;
  allocationEvents: number;
  eventsPerYear: number;
  annualRebalances: number;
  driftRebalances: number;
  averageHoldingYears: number;
  averageAllocationPct: Record<Sleeve, number>;
  sessionsAtLiquidMinimumPct: number;
  charges: number;
  slippage: number;
  trackingDrag: number;
  tax: number;
  contributionApprox: Record<Sleeve, number>;
  drawdownContributionApprox: Record<Sleeve, number>;
  worstYear: { year: string; returnPct: number } | null;
  worstRollingYear: ReturnPoint | null;
  worstFiveSessions: ReturnPoint[];
};

export type LongtermStressSummary = {
  doubledCosts: Pick<LongtermMetrics, "endingValue" | "cagrPct" | "maxDrawdown">;
  doubledDrag: Pick<LongtermMetrics, "endingValue" | "cagrPct" | "maxDrawdown">;
  currentTax: Pick<LongtermMetrics, "endingValue" | "cagrPct" | "maxDrawdown" | "tax"> & {
    asOf: string;
    note: string;
  };
};

export type WholeUnitSummary = {
  endingValue: number;
  differenceFromFractional: number;
  differencePct: number;
  representativeEtfs: RepresentativeEtfConfig;
  note: string;
};

export type LongtermResult = {
  variant: LongtermVariantName;
  benchmark: "STATIC-NEXT" | "STATIC-MID";
  sample: { from: string; to: string; initialCapital: number };
  runIdentity: {
    id: string;
    dataVersion: string;
    dataFingerprint: string;
    rulesVersion: string;
    variant: LongtermVariantName;
    costs: LongtermCostConfig;
    drag: LongtermDragConfig;
    taxAsOf: string;
    targets: Record<Sleeve, number>;
    series: Record<Sleeve, LongtermSeriesKey>;
    effectiveRules: typeof EFFECTIVE_RULES;
    assumptions: string[];
  };
  metrics: LongtermMetrics;
  stress: LongtermStressSummary;
  wholeUnit: WholeUnitSummary;
  equity: LongtermEquityPoint[];
  allocations: LongtermAllocationPoint[];
  events: LongtermEvent[];
  provenance: LongtermDataset["provenance"];
};

export type AcceptanceComparison = {
  radar: "RADAR-NEXT" | "RADAR-MID";
  benchmark: "STATIC-NEXT" | "STATIC-MID";
  checks: {
    drawdownReduction: boolean;
    cagrGap: boolean;
    positiveFiveYearWindows: boolean;
    fasterRecovery: boolean;
    eventsPerYear: boolean;
    stressDrawdownAdvantage: boolean;
    diversifiedProfit: boolean;
  };
  qualified: boolean;
  details: Record<string, number | string | boolean | null>;
};

export type LongtermBookResult = {
  results: Record<LongtermVariantName, LongtermResult>;
  comparisons: AcceptanceComparison[];
};

type ResolvedOptions = {
  initialCapital: number;
  costs: LongtermCostConfig;
  drag: LongtermDragConfig;
  tax: LongtermTaxConfig;
  riskFreeAnnual: number;
  from: string;
  to: string;
};

type PendingAction =
  | {
      executeAt: number;
      signalDate: string;
      type: "target";
      kind: "initial" | "annual" | "drift";
      reason: string;
    }
  | {
      executeAt: number;
      signalDate: string;
      type: "stage";
      sleeve: RiskySleeve;
      stage: 1 | 2 | 3;
      regime: "normal" | "crisis";
      cumulativeTarget: number;
      reason: string;
    }
  | {
      executeAt: number;
      signalDate: string;
      type: "warning";
      sleeve: RiskySleeve;
      fraction: number;
      reason: string;
    };

type Lot = { units: number; basis: number; acquired: string };

type SleeveState = {
  units: number;
  lots: Lot[];
  arm: "none" | "normal" | "crisis";
  stage: 0 | 1 | 2 | 3;
  stage1Close: number;
  stage1Week: number;
  lastStageWeek: number;
  warningStreak: number;
};

type PriceGrid = Record<Sleeve, number[]>;

type RunConfig = {
  variant: LongtermVariant;
  dataset: LongtermDataset;
  options: ResolvedOptions;
  wholeUnits: boolean;
  costMultiplier: number;
  dragMultiplier: number;
  applyTax: boolean;
};

type BaseRun = {
  metrics: LongtermMetrics;
  equity: LongtermEquityPoint[];
  allocations: LongtermAllocationPoint[];
  events: LongtermEvent[];
};

type SignalFrame = {
  monthEnd: boolean[];
  weekEnd: boolean[];
  weekNumber: number[];
  weekEndIndices: number[];
  monthEndIndices: number[];
  trend: Record<RiskySleeve, boolean[]>;
  warning: Record<RiskySleeve, boolean[]>;
  drawdown: Record<RiskySleeve, number[]>;
};

const ASSUMPTIONS = [
  "Signals use source-series closes only and execute at the next NIFTY session level; daily total-return data has no opening level.",
  "A new 13-week closing high means the current weekly close exceeds the preceding 12 completed weekly closes.",
  "Normal Stage 1 compares the current weekly close with every daily close in the previous completed week.",
  "A crisis replaces any incomplete normal sequence; already-held units remain subject to the target cap.",
  "After a warning clears, replenishment requires a fresh correction and a new sequential opportunity.",
  "Target caps and the 15% liquid floor are enforced at allocation-changing trades; subsequent market drift is reported, not silently rebalanced.",
  "Costs are an equivalent percentage model; current-tax stress taxes realised gains only and does not liquidate the ending book.",
  "Whole-unit prices rescale current representative ETF prices to historical index/NAV returns and do not imply pre-launch tradeability.",
];

const EFFECTIVE_RULES = {
  trendAverageMonths: 10,
  trendReturnMonths: 12,
  drawdownSessions: 252,
  normalDrawdownFrom: 0.08,
  crisisDrawdownFrom: 0.2,
  stageFractions: [0.3, 0.3, 0.4],
  normalStage2EmaWeeks: 10,
  stage3HighWeeks: 13,
  crisisStage1LookbackWeeks: 4,
  staticDriftPercentagePoints: 5,
  staticAnnualReviewMonth: 3,
  warningExitFractions: [0.5, 1],
  maximumStagesPerSleeveWeek: 1,
};

export function simulateLongterm(
  dataset: LongtermDataset,
  variantName: LongtermVariantName,
  options: LongtermSimulationOptions = {}
): LongtermResult {
  const variant = getLongtermVariant(variantName);
  const resolved = resolveOptions(options);
  validateDataset(dataset, variant, resolved.from, resolved.to);
  const primary = runBase({ variant, dataset, options: resolved, wholeUnits: false, costMultiplier: 1, dragMultiplier: 1, applyTax: false });
  const doubledCosts = runBase({ variant, dataset, options: resolved, wholeUnits: false, costMultiplier: 2, dragMultiplier: 1, applyTax: false });
  const doubledDrag = runBase({ variant, dataset, options: resolved, wholeUnits: false, costMultiplier: 1, dragMultiplier: 2, applyTax: false });
  const currentTax = runBase({ variant, dataset, options: resolved, wholeUnits: false, costMultiplier: 1, dragMultiplier: 1, applyTax: true });
  const whole = runBase({ variant, dataset, options: resolved, wholeUnits: true, costMultiplier: 1, dragMultiplier: 1, applyTax: false });
  const identityInput = {
    dataVersion: LONGTERM_DATA_VERSION,
    fingerprint: dataset.fingerprint,
    rulesVersion: "longgame-frozen-v1",
    variant: variant.name,
    from: resolved.from,
    to: resolved.to,
    initialCapital: resolved.initialCapital,
    costs: resolved.costs,
    drag: resolved.drag,
    tax: resolved.tax,
    riskFreeAnnual: resolved.riskFreeAnnual,
    effectiveRules: EFFECTIVE_RULES,
    targets: variant.targets,
    series: variant.series,
    assumptions: ASSUMPTIONS,
  };
  return {
    variant: variant.name,
    benchmark: variant.benchmark,
    sample: { from: resolved.from, to: resolved.to, initialCapital: resolved.initialCapital },
    runIdentity: {
      id: createHash("sha256").update(stableStringify(identityInput)).digest("hex"),
      dataVersion: LONGTERM_DATA_VERSION,
      dataFingerprint: dataset.fingerprint,
      rulesVersion: "longgame-frozen-v1",
      variant: variant.name,
      costs: resolved.costs,
      drag: resolved.drag,
      taxAsOf: resolved.tax.asOf,
      targets: { ...variant.targets },
      series: { ...variant.series },
      effectiveRules: { ...EFFECTIVE_RULES, stageFractions: [...EFFECTIVE_RULES.stageFractions], warningExitFractions: [...EFFECTIVE_RULES.warningExitFractions] },
      assumptions: [...ASSUMPTIONS],
    },
    metrics: primary.metrics,
    stress: {
      doubledCosts: metricStress(doubledCosts.metrics),
      doubledDrag: metricStress(doubledDrag.metrics),
      currentTax: {
        ...metricStress(currentTax.metrics),
        tax: currentTax.metrics.tax,
        asOf: resolved.tax.asOf,
        note: "Current-law approximation on realised gains; not historically exact and no terminal liquidation is assumed.",
      },
    },
    wholeUnit: {
      endingValue: whole.metrics.endingValue,
      differenceFromFractional: whole.metrics.endingValue - primary.metrics.endingValue,
      differencePct: pct(whole.metrics.endingValue / primary.metrics.endingValue - 1),
      representativeEtfs: DEFAULT_REPRESENTATIVE_ETFS,
      note: "Fractional liquid-index units remain allowed; risky ETF purchases are rounded down to whole representative units.",
    },
    equity: primary.equity,
    allocations: primary.allocations,
    events: primary.events,
    provenance: dataset.provenance.map((row) => ({ ...row, missingSessions: [...row.missingSessions] })),
  };
}

export function simulateLongtermBook(
  dataset: LongtermDataset,
  options: LongtermSimulationOptions = {}
): LongtermBookResult {
  const results = Object.fromEntries(
    LONGTERM_VARIANT_NAMES.map((name) => [name, simulateLongterm(dataset, name, options)])
  ) as Record<LongtermVariantName, LongtermResult>;
  return {
    results,
    comparisons: [
      compareLongterm(results["RADAR-NEXT"], results["STATIC-NEXT"]),
      compareLongterm(results["RADAR-MID"], results["STATIC-MID"]),
    ],
  };
}

export function compareLongterm(radar: LongtermResult, benchmark: LongtermResult): AcceptanceComparison {
  if (!radar.variant.startsWith("RADAR") || radar.benchmark !== benchmark.variant) {
    throw new Error(`${radar.variant} must be compared only with ${radar.benchmark}.`);
  }
  const radarRecovery = radar.metrics.maxDrawdown.recoveryDate
    ? radar.metrics.maxDrawdown.daysUnderwater
    : Number.POSITIVE_INFINITY;
  const staticRecovery = benchmark.metrics.maxDrawdown.recoveryDate
    ? benchmark.metrics.maxDrawdown.daysUnderwater
    : Number.POSITIVE_INFINITY;
  const stressAdvantage =
    radar.stress.doubledCosts.maxDrawdown.pct < benchmark.stress.doubledCosts.maxDrawdown.pct
    && radar.stress.doubledDrag.maxDrawdown.pct < benchmark.stress.doubledDrag.maxDrawdown.pct;
  const positiveContributions = RISKY.map((sleeve) => Math.max(0, radar.metrics.contributionApprox[sleeve]));
  const contributionTotal = sum(positiveContributions);
  const largestAssetShare = contributionTotal > 0 ? Math.max(...positiveContributions) / contributionTotal : 1;
  const positiveYears = Object.values(radar.metrics.calendarYearReturns).map((value) => Math.max(0, value));
  const largestPeriodShare = sum(positiveYears) > 0 ? Math.max(...positiveYears) / sum(positiveYears) : 1;
  const checks = {
    drawdownReduction: radar.metrics.maxDrawdown.pct <= benchmark.metrics.maxDrawdown.pct * 0.85,
    cagrGap: radar.metrics.cagrPct >= benchmark.metrics.cagrPct - 2,
    positiveFiveYearWindows: radar.metrics.positiveRollingFiveYearPct >= 80,
    fasterRecovery: radarRecovery < staticRecovery,
    eventsPerYear: radar.metrics.eventsPerYear <= 6,
    stressDrawdownAdvantage: stressAdvantage,
    diversifiedProfit: largestAssetShare <= 0.5 && largestPeriodShare <= 0.5,
  };
  return {
    radar: radar.variant as "RADAR-NEXT" | "RADAR-MID",
    benchmark: benchmark.variant as "STATIC-NEXT" | "STATIC-MID",
    checks,
    qualified: Object.values(checks).every(Boolean),
    details: {
      radarDrawdownPct: radar.metrics.maxDrawdown.pct,
      staticDrawdownPct: benchmark.metrics.maxDrawdown.pct,
      radarCagrPct: radar.metrics.cagrPct,
      staticCagrPct: benchmark.metrics.cagrPct,
      positiveFiveYearPct: radar.metrics.positiveRollingFiveYearPct,
      radarRecoveryDays: Number.isFinite(radarRecovery) ? radarRecovery : null,
      staticRecoveryDays: Number.isFinite(staticRecovery) ? staticRecovery : null,
      eventsPerYear: radar.metrics.eventsPerYear,
      largestAssetProfitSharePct: pct(largestAssetShare),
      largestPositiveYearSharePct: pct(largestPeriodShare),
    },
  };
}

function runBase(config: RunConfig): BaseRun {
  const { dataset, variant, options } = config;
  const allDates = dataset.dates.filter((date) => date <= options.to);
  const fromIndex = allDates.findIndex((date) => date >= options.from);
  const toIndex = lastIndex(allDates, (date) => date <= options.to);
  const signal = buildSignalFrame(dataset, variant, allDates);
  const prices = buildPrices(dataset, variant, allDates, options.drag, config.dragMultiplier);
  const states = Object.fromEntries(RISKY.map((sleeve) => [sleeve, emptySleeveState()])) as Record<RiskySleeve, SleeveState>;
  const liquid = { units: options.initialCapital / prices.liquid[fromIndex] };
  const pending: PendingAction[] = [];
  const events: LongtermEvent[] = [];
  const allocations: LongtermAllocationPoint[] = [];
  const equity: LongtermEquityPoint[] = [];
  const contribution = zeroSleeves();
  let charges = 0;
  let slippage = 0;
  let trackingDrag = 0;
  let taxes = 0;
  let turnover = 0;
  let annualRebalances = 0;
  let driftRebalances = 0;
  let holdingValueDays = 0;
  let holdingValue = 0;
  const equityExemptionUsed = new Map<string, number>();

  const valuesAt = (index: number): Record<Sleeve, number> => ({
    nifty50: states.nifty50.units * prices.nifty50[index],
    secondary: states.secondary.units * prices.secondary[index],
    gold: states.gold.units * prices.gold[index],
    liquid: liquid.units * prices.liquid[index],
  });
  const totalAt = (index: number): number => sum(Object.values(valuesAt(index)));

  const addLiquid = (amount: number, index: number): void => {
    liquid.units += amount / prices.liquid[index];
  };
  const takeLiquid = (amount: number, index: number): number => {
    const available = liquid.units * prices.liquid[index];
    const taken = Math.max(0, Math.min(amount, available));
    liquid.units -= taken / prices.liquid[index];
    return taken;
  };

  const buy = (
    sleeve: RiskySleeve,
    cashBudget: number,
    index: number,
    action: Omit<LongtermEvent, "gross" | "charges" | "slippage" | "tax" | "allocationAfter" | "executionDate">
  ): void => {
    const total = totalAt(index);
    const current = valuesAt(index)[sleeve];
    const rateCost = options.costs.transactionCostPct * config.costMultiplier;
    const rateSlip = options.costs.slippagePct;
    const lossRate = rateCost + rateSlip;
    const target = variant.targets[sleeve];
    const liquidTarget = variant.targets.liquid;
    const capNotional = Math.max(0, (target * total - current) / (1 + target * lossRate));
    const liquidNotional = Math.max(
      0,
      (valuesAt(index).liquid - liquidTarget * total) / (1 + lossRate * (1 - liquidTarget))
    );
    let baseNotional = Math.min(cashBudget / (1 + lossRate), capNotional, liquidNotional);
    if (baseNotional <= 1e-9) return;
    let units = baseNotional / prices[sleeve][index];
    if (config.wholeUnits) {
      units = Math.floor(units + 1e-12);
      baseNotional = units * prices[sleeve][index];
    }
    if (units <= 0) return;
    const fee = baseNotional * rateCost;
    const slip = baseNotional * rateSlip;
    const spent = takeLiquid(baseNotional + fee + slip, index);
    if (spent + 1e-7 < baseNotional + fee + slip) throw new Error("Long Game buy exceeded liquid residual.");
    states[sleeve].units += units;
    states[sleeve].lots.push({ units, basis: baseNotional + fee + slip, acquired: allDates[index] });
    charges += fee;
    slippage += slip;
    turnover += baseNotional;
    contribution[sleeve] -= fee + slip;
    const allocationAfter = weights(valuesAt(index));
    events.push({ ...action, executionDate: allDates[index], gross: baseNotional, charges: fee, slippage: slip, tax: 0, allocationAfter });
  };

  const sell = (
    sleeve: RiskySleeve,
    requestedUnits: number,
    index: number,
    action: Omit<LongtermEvent, "gross" | "charges" | "slippage" | "tax" | "allocationAfter" | "executionDate">
  ): void => {
    const state = states[sleeve];
    let units = Math.min(state.units, requestedUnits);
    if (config.wholeUnits) units = Math.floor(units + 1e-12);
    if (units <= 1e-12) return;
    const gross = units * prices[sleeve][index];
    const fee = gross * options.costs.transactionCostPct * config.costMultiplier;
    const slip = gross * options.costs.slippagePct;
    let remaining = units;
    let tax = 0;
    while (remaining > 1e-10 && state.lots.length) {
      const lot = state.lots[0];
      const sold = Math.min(remaining, lot.units);
      const basis = lot.basis * (sold / lot.units);
      const proceeds = sold * prices[sleeve][index];
      const gain = Math.max(0, proceeds - basis);
      const days = dayDiff(lot.acquired, allDates[index]);
      if (config.applyTax && gain > 0) {
        tax += taxForGain(sleeve, gain, days, allDates[index].slice(0, 4), options.tax, equityExemptionUsed);
      }
      holdingValueDays += proceeds * days;
      holdingValue += proceeds;
      lot.units -= sold;
      lot.basis -= basis;
      remaining -= sold;
      if (lot.units <= 1e-10) state.lots.shift();
    }
    state.units -= units;
    addLiquid(gross - fee - slip - tax, index);
    charges += fee;
    slippage += slip;
    taxes += tax;
    turnover += gross;
    contribution[sleeve] -= fee + slip + tax;
    const allocationAfter = weights(valuesAt(index));
    events.push({ ...action, executionDate: allDates[index], gross, charges: fee, slippage: slip, tax, allocationAfter });
  };

  const rebalance = (index: number, item: Extract<PendingAction, { type: "target" }>): void => {
    const before = totalAt(index);
    const desired = Object.fromEntries(RISKY.map((sleeve) => [sleeve, before * variant.targets[sleeve]])) as Record<RiskySleeve, number>;
    for (const sleeve of RISKY) {
      const current = valuesAt(index)[sleeve];
      if (current > desired[sleeve] + 1e-8) {
        sell(sleeve, (current - desired[sleeve]) / prices[sleeve][index], index, {
          signalDate: item.signalDate,
          sleeve,
          action: "SELL",
          kind: item.kind,
          reason: item.reason,
        });
      }
    }
    for (const sleeve of RISKY) {
      const current = valuesAt(index)[sleeve];
      if (current < desired[sleeve] - 1e-8) {
        buy(sleeve, desired[sleeve] - current, index, {
          signalDate: item.signalDate,
          sleeve,
          action: "BUY",
          kind: item.kind,
          reason: item.reason,
        });
      }
    }
    events.push({
      signalDate: item.signalDate,
      executionDate: allDates[index],
      sleeve: "portfolio",
      action: "REBALANCE",
      kind: item.kind,
      reason: item.reason,
      gross: 0,
      charges: 0,
      slippage: 0,
      tax: 0,
      allocationAfter: weights(valuesAt(index)),
    });
  };

  const execute = (index: number): void => {
    const due = pending.filter((item) => item.executeAt === index);
    for (const item of due) {
      if (item.type === "target") {
        rebalance(index, item);
      } else if (item.type === "stage") {
        const total = totalAt(index);
        const desired = total * variant.targets[item.sleeve] * item.cumulativeTarget;
        const current = valuesAt(index)[item.sleeve];
        buy(item.sleeve, Math.max(0, desired - current), index, {
          signalDate: item.signalDate,
          sleeve: item.sleeve,
          action: "BUY",
          kind: "stage",
          stage: item.stage,
          regime: item.regime,
          reason: item.reason,
        });
      } else {
        sell(item.sleeve, states[item.sleeve].units * item.fraction, index, {
          signalDate: item.signalDate,
          sleeve: item.sleeve,
          action: "SELL",
          kind: "warning",
          reason: item.reason,
        });
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].executeAt === index) pending.splice(i, 1);
  };

  if (variant.kind === "static") {
    pending.push({
      executeAt: fromIndex,
      signalDate: allDates[fromIndex],
      type: "target",
      kind: "initial",
      reason: "Invest target weights on the first executable building-sample session.",
    });
  }

  let previousValues: Record<Sleeve, number> | null = null;
  let peak = options.initialCapital;
  for (let index = fromIndex; index <= toIndex; index++) {
    if (previousValues) {
      for (const sleeve of SLEEVES) {
        const currentBeforeTrades = valuesAt(index)[sleeve];
        contribution[sleeve] += currentBeforeTrades - previousValues[sleeve];
        if (sleeve !== "liquid") {
          const raw = dataset.values[variant.series[sleeve]].get(allDates[index])!;
          const rawPrevious = dataset.values[variant.series[sleeve]].get(allDates[index - 1])!;
          const noDrag = previousValues[sleeve] * (raw / rawPrevious);
          trackingDrag += Math.max(0, noDrag - currentBeforeTrades);
        }
      }
    }

    execute(index);
    const currentValues = valuesAt(index);
    const total = sum(Object.values(currentValues));
    peak = Math.max(peak, total);
    const drawdownPct = peak > 0 ? pct(1 - total / peak) : 0;
    equity.push({ date: allDates[index], value: total, drawdownPct });
    allocations.push({ date: allDates[index], value: total, values: currentValues, weights: weights(currentValues) });

    if (index < toIndex) {
      if (variant.kind === "static" && signal.monthEnd[index]) {
        const month = allDates[index].slice(5, 7);
        const currentWeights = weights(currentValues);
        const drift = SLEEVES.some((sleeve) => Math.abs(currentWeights[sleeve] - variant.targets[sleeve]) > 0.05 + 1e-12);
        if (month === "03") {
          annualRebalances++;
          pending.push({
            executeAt: index + 1,
            signalDate: allDates[index],
            type: "target",
            kind: "annual",
            reason: "March month-end annual review; execute on the next NIFTY session.",
          });
        } else if (drift) {
          driftRebalances++;
          pending.push({
            executeAt: index + 1,
            signalDate: allDates[index],
            type: "target",
            kind: "drift",
            reason: "A sleeve exceeded its target by more than five percentage points at month-end.",
          });
        }
      } else if (variant.kind === "radar") {
        updateRadarSignals(index, allDates, dataset, variant, signal, states, pending);
      }
    }
    previousValues = valuesAt(index);
  }

  for (const sleeve of RISKY) {
    for (const lot of states[sleeve].lots) {
      const endingValue = lot.units * prices[sleeve][toIndex];
      holdingValueDays += endingValue * dayDiff(lot.acquired, allDates[toIndex]);
      holdingValue += endingValue;
    }
  }
  const metrics = calculateMetrics({
    equity,
    allocations,
    events,
    initialCapital: options.initialCapital,
    riskFreeAnnual: options.riskFreeAnnual,
    turnover,
    annualRebalances,
    driftRebalances,
    charges,
    slippage,
    trackingDrag,
    taxes,
    contribution,
    averageHoldingYears: holdingValue > 0 ? holdingValueDays / holdingValue / 365.2425 : 0,
  });
  return { metrics, equity, allocations, events };
}

function updateRadarSignals(
  index: number,
  dates: string[],
  dataset: LongtermDataset,
  variant: LongtermVariant,
  signal: SignalFrame,
  states: Record<RiskySleeve, SleeveState>,
  pending: PendingAction[]
): void {
  for (const sleeve of RISKY) {
    const state = states[sleeve];
    const trend = signal.trend[sleeve][index];
    const drawdown = signal.drawdown[sleeve][index];
    if (drawdown >= 0.2 && state.arm !== "crisis") {
      state.arm = "crisis";
      state.stage = 0;
      state.stage1Close = 0;
      state.stage1Week = -1;
      pending.splice(0, pending.length, ...pending.filter((item) => item.type !== "stage" || item.sleeve !== sleeve));
    } else if (drawdown >= 0.08 && drawdown < 0.2 && trend && state.arm === "none") {
      state.arm = "normal";
      state.stage = 0;
    }

    if (signal.monthEnd[index]) {
      if (signal.warning[sleeve][index]) {
        state.warningStreak++;
        state.arm = "none";
        state.stage = 0;
        pending.splice(0, pending.length, ...pending.filter((item) => item.type !== "stage" || item.sleeve !== sleeve));
        pending.push({
          executeAt: index + 1,
          signalDate: dates[index],
          type: "warning",
          sleeve,
          fraction: state.warningStreak === 1 ? 0.5 : 1,
          reason: state.warningStreak === 1
            ? "First completed warning month: sell 50% on the next session."
            : "Second consecutive completed warning month: sell the remainder on the next session.",
        });
        if (state.warningStreak >= 2) state.warningStreak = 2;
        continue;
      }
      state.warningStreak = 0;
      if (
        state.arm === "crisis"
        && state.stage === 1
        && trend
        && signal.weekNumber[index] > state.stage1Week
        && state.lastStageWeek !== signal.weekNumber[index]
      ) {
        queueStage(index, dates, state, pending, sleeve, 2, "crisis", "A later completed month restored the positive long-term trend.");
      }
    }

    if (!signal.weekEnd[index] || state.arm === "none" || state.lastStageWeek === signal.weekNumber[index]) continue;
    const series = dataset.values[variant.series[sleeve]];
    const close = series.get(dates[index])!;
    const priorWeekEnds = signal.weekEndIndices.filter((item) => item < index);
    if (state.stage === 0) {
      if (state.arm === "normal") {
        const previousWeek = priorWeekEnds.length ? signal.weekNumber[priorWeekEnds.at(-1)!] : -1;
        const previousDaily = dates
          .map((date, item) => ({ date, item }))
          .filter((row) => row.item < index && signal.weekNumber[row.item] === previousWeek)
          .map((row) => series.get(row.date)!);
        if (previousDaily.length && close > Math.max(...previousDaily)) {
          state.stage1Close = close;
          state.stage1Week = signal.weekNumber[index];
          queueStage(index, dates, state, pending, sleeve, 1, "normal", "Weekly close exceeded the highest daily close in the previous completed week.");
        }
      } else {
        const previousFour = priorWeekEnds.slice(-4).map((item) => series.get(dates[item])!);
        if (previousFour.length === 4 && close > Math.max(...previousFour)) {
          state.stage1Close = close;
          state.stage1Week = signal.weekNumber[index];
          queueStage(index, dates, state, pending, sleeve, 1, "crisis", "Weekly close exceeded the highest weekly close of the previous four completed weeks.");
        }
      }
    } else if (state.stage === 1 && state.arm === "normal") {
      const weekly = [...priorWeekEnds.slice(-9), index].map((item) => series.get(dates[item])!);
      if (weekly.length === 10 && close > ema(weekly, 10) && close > state.stage1Close) {
        queueStage(index, dates, state, pending, sleeve, 2, "normal", "A later weekly close was above its 10-week EMA and above the Stage 1 signal close.");
      }
    } else if (state.stage === 2) {
      const previousTwelve = priorWeekEnds.slice(-12).map((item) => series.get(dates[item])!);
      if (previousTwelve.length === 12 && close > Math.max(...previousTwelve)) {
        queueStage(index, dates, state, pending, sleeve, 3, state.arm, "A later weekly close made a new 13-week closing high.");
      }
    }
  }
}

function queueStage(
  index: number,
  dates: string[],
  state: SleeveState,
  pending: PendingAction[],
  sleeve: RiskySleeve,
  stage: 1 | 2 | 3,
  regime: "normal" | "crisis",
  reason: string
): void {
  state.stage = stage;
  state.lastStageWeek = weekSerial(dates[index]);
  pending.push({
    executeAt: index + 1,
    signalDate: dates[index],
    type: "stage",
    sleeve,
    stage,
    regime,
    cumulativeTarget: stage === 1 ? 0.3 : stage === 2 ? 0.6 : 1,
    reason,
  });
}

function buildSignalFrame(dataset: LongtermDataset, variant: LongtermVariant, dates: string[]): SignalFrame {
  const weekNumber = dates.map(weekSerial);
  const weekEnd = dates.map((_, index) => index === dates.length - 1 || weekNumber[index + 1] !== weekNumber[index]);
  const monthEnd = dates.map((date, index) => index === dates.length - 1 || dates[index + 1].slice(0, 7) !== date.slice(0, 7));
  const weekEndIndices = weekEnd.flatMap((yes, index) => yes ? [index] : []);
  const monthEndIndices = monthEnd.flatMap((yes, index) => yes ? [index] : []);
  const trend = {} as Record<RiskySleeve, boolean[]>;
  const warning = {} as Record<RiskySleeve, boolean[]>;
  const drawdown = {} as Record<RiskySleeve, number[]>;
  for (const sleeve of RISKY) {
    const series = dataset.values[variant.series[sleeve]];
    trend[sleeve] = Array(dates.length).fill(false);
    warning[sleeve] = Array(dates.length).fill(false);
    drawdown[sleeve] = Array(dates.length).fill(0);
    let latestTrend = false;
    let latestWarning = false;
    const completedMonths: number[] = [];
    for (let index = 0; index < dates.length; index++) {
      const previous = Array.from({ length: Math.min(252, index) }, (_, offset) => series.get(dates[index - offset - 1])!);
      const close = series.get(dates[index])!;
      drawdown[sleeve][index] = previous.length ? Math.max(0, 1 - close / Math.max(...previous)) : 0;
      trend[sleeve][index] = latestTrend;
      warning[sleeve][index] = latestWarning;
      if (monthEnd[index]) {
        completedMonths.push(index);
        if (completedMonths.length >= 13) {
          const lastTen = completedMonths.slice(-10).map((item) => series.get(dates[item])!);
          const twelveMonthsAgo = series.get(dates[completedMonths.at(-13)!])!;
          const average = sum(lastTen) / lastTen.length;
          latestTrend = close > average && close / twelveMonthsAgo - 1 > 0;
          latestWarning = close < average && close / twelveMonthsAgo - 1 < 0;
        } else {
          latestTrend = false;
          latestWarning = false;
        }
        trend[sleeve][index] = latestTrend;
        warning[sleeve][index] = latestWarning;
      }
    }
  }
  return { monthEnd, weekEnd, weekNumber, weekEndIndices, monthEndIndices, trend, warning, drawdown };
}

function buildPrices(
  dataset: LongtermDataset,
  variant: LongtermVariant,
  dates: string[],
  drag: LongtermDragConfig,
  dragMultiplier: number
): PriceGrid {
  const out = {} as PriceGrid;
  for (const sleeve of SLEEVES) {
    const series = dataset.values[variant.series[sleeve]];
    const firstDate = dates.find((date) => series.has(date));
    if (!firstDate) throw new Error(`${variant.series[sleeve]} has no usable values.`);
    const first = series.get(firstDate)!;
    const base = sleeve === "liquid" ? 100 : DEFAULT_REPRESENTATIVE_ETFS[sleeve].currentPrice;
    out[sleeve] = dates.map((date) => {
      const raw = series.get(date);
      if (raw == null) return base;
      const elapsedYears = dayDiff(firstDate, date) / 365.2425;
      const annualDrag = sleeve === "liquid" ? 0 : drag[sleeve] * dragMultiplier;
      return base * (raw / first) * Math.pow(1 - annualDrag, elapsedYears);
    });
  }
  return out;
}

function calculateMetrics(input: {
  equity: LongtermEquityPoint[];
  allocations: LongtermAllocationPoint[];
  events: LongtermEvent[];
  initialCapital: number;
  riskFreeAnnual: number;
  turnover: number;
  annualRebalances: number;
  driftRebalances: number;
  charges: number;
  slippage: number;
  trackingDrag: number;
  taxes: number;
  contribution: Record<Sleeve, number>;
  averageHoldingYears: number;
}): LongtermMetrics {
  const { equity, allocations } = input;
  const endingValue = equity.at(-1)?.value ?? input.initialCapital;
  const years = Math.max(dayDiff(equity[0].date, equity.at(-1)!.date) / 365.2425, 1 / 365.2425);
  const daily = equity.slice(1).map((point, index) => point.value / equity[index].value - 1);
  const meanDaily = average(daily);
  const volatility = stddev(daily) * Math.sqrt(252);
  const riskFreeDaily = Math.pow(1 + input.riskFreeAnnual, 1 / 252) - 1;
  const downside = Math.sqrt(average(daily.map((value) => Math.min(0, value - riskFreeDaily) ** 2))) * Math.sqrt(252);
  const excessAnnual = (meanDaily - riskFreeDaily) * 252;
  const maxDrawdown = drawdownMetrics(equity);
  const calendarYearReturns = calendarReturns(equity, input.initialCapital);
  const rolling = {
    oneYear: rollingReturns(equity, 1),
    threeYear: rollingReturns(equity, 3),
    fiveYear: rollingReturns(equity, 5),
  };
  const positiveFive = rolling.fiveYear.length
    ? pct(rolling.fiveYear.filter((point) => point.returnPct > 0).length / rolling.fiveYear.length)
    : 0;
  const averageAllocationPct = Object.fromEntries(SLEEVES.map((sleeve) => [
    sleeve,
    pct(average(allocations.map((point) => point.weights[sleeve]))),
  ])) as Record<Sleeve, number>;
  const sessionsAtLiquidMinimumPct = pct(
    allocations.filter((point) => point.weights.liquid > 0.150001).length / Math.max(1, allocations.length)
  );
  const allocationEvents = input.events.filter((event) =>
    event.action === "REBALANCE" || ((event.kind === "stage" || event.kind === "warning") && event.gross > 0)
  ).length;
  const worstYearEntry = Object.entries(calendarYearReturns).sort((a, b) => a[1] - b[1])[0];
  const worstRollingYear = [...rolling.oneYear].sort((a, b) => a.returnPct - b.returnPct)[0] ?? null;
  const worstFiveSessions = equity.slice(1)
    .map((point, index) => ({ date: point.date, returnPct: pct(point.value / equity[index].value - 1) }))
    .sort((a, b) => a.returnPct - b.returnPct)
    .slice(0, 5);
  const peakAllocation = allocations.find((point) => point.date === maxDrawdown.peakDate);
  const troughAllocation = allocations.find((point) => point.date === maxDrawdown.troughDate);
  const drawdownContributionApprox = Object.fromEntries(SLEEVES.map((sleeve) => [
    sleeve,
    (troughAllocation?.values[sleeve] ?? 0) - (peakAllocation?.values[sleeve] ?? 0),
  ])) as Record<Sleeve, number>;
  const averageEquity = average(equity.map((point) => point.value));
  return {
    endingValue,
    cagrPct: pct(Math.pow(endingValue / input.initialCapital, 1 / years) - 1),
    maxDrawdown,
    calendarYearReturns,
    rollingReturns: rolling,
    positiveRollingFiveYearPct: positiveFive,
    annualizedVolatilityPct: pct(volatility),
    downsideDeviationPct: pct(downside),
    sharpe: volatility > 0 ? excessAnnual / volatility : null,
    sortino: downside > 0 ? excessAnnual / downside : null,
    riskFreeAnnualPct: pct(input.riskFreeAnnual),
    turnoverPct: averageEquity > 0 ? pct(input.turnover / averageEquity) : 0,
    allocationEvents,
    eventsPerYear: allocationEvents / years,
    annualRebalances: input.annualRebalances,
    driftRebalances: input.driftRebalances,
    averageHoldingYears: input.averageHoldingYears,
    averageAllocationPct,
    sessionsAtLiquidMinimumPct,
    charges: input.charges,
    slippage: input.slippage,
    trackingDrag: input.trackingDrag,
    tax: input.taxes,
    contributionApprox: input.contribution,
    drawdownContributionApprox,
    worstYear: worstYearEntry ? { year: worstYearEntry[0], returnPct: worstYearEntry[1] } : null,
    worstRollingYear,
    worstFiveSessions,
  };
}

function drawdownMetrics(equity: LongtermEquityPoint[]): LongtermMetrics["maxDrawdown"] {
  let peakIndex = 0;
  let worstPeak = 0;
  let trough = 0;
  let worst = 0;
  for (let index = 1; index < equity.length; index++) {
    if (equity[index].value > equity[peakIndex].value) peakIndex = index;
    const drawdown = 1 - equity[index].value / equity[peakIndex].value;
    if (drawdown > worst) {
      worst = drawdown;
      worstPeak = peakIndex;
      trough = index;
    }
  }
  if (worst === 0) {
    return {
      pct: 0,
      peakDate: equity[0].date,
      troughDate: equity[0].date,
      recoveryDate: equity[0].date,
      daysUnderwater: 0,
    };
  }
  const recoveryIndex = equity.findIndex((point, index) => index > trough && point.value >= equity[worstPeak].value);
  const end = recoveryIndex >= 0 ? recoveryIndex : equity.length - 1;
  return {
    pct: pct(worst),
    peakDate: equity[worstPeak].date,
    troughDate: equity[trough].date,
    recoveryDate: recoveryIndex >= 0 ? equity[recoveryIndex].date : null,
    daysUnderwater: dayDiff(equity[worstPeak].date, equity[end].date),
  };
}

function calendarReturns(equity: LongtermEquityPoint[], initial: number): Record<string, number> {
  const result: Record<string, number> = {};
  let start = initial;
  for (let index = 0; index < equity.length; index++) {
    const year = equity[index].date.slice(0, 4);
    const nextYear = equity[index + 1]?.date.slice(0, 4);
    if (nextYear !== year) {
      result[year] = pct(equity[index].value / start - 1);
      start = equity[index].value;
    }
  }
  return result;
}

function rollingReturns(equity: LongtermEquityPoint[], years: number): ReturnPoint[] {
  const monthEnds = equity.filter((point, index) => index === equity.length - 1 || equity[index + 1].date.slice(0, 7) !== point.date.slice(0, 7));
  const result: ReturnPoint[] = [];
  for (const point of monthEnds) {
    const target = shiftYears(point.date, -years);
    const prior = lastMatching(equity, (candidate) => candidate.date <= target);
    if (!prior || dayDiff(prior.date, point.date) < years * 350) continue;
    result.push({ date: point.date, returnPct: pct(point.value / prior.value - 1) });
  }
  return result;
}

function validateDataset(dataset: LongtermDataset, variant: LongtermVariant, from: string, to: string): void {
  if (to > LONGTERM_BUILDING_TO) throw new Error(`Long Game simulator refuses held-back dates after ${LONGTERM_BUILDING_TO}.`);
  if (from < LONGTERM_BUILDING_FROM || from > to) throw new Error(`Invalid Long Game window ${from} through ${to}.`);
  const sorted = [...dataset.dates].sort();
  if (new Set(sorted).size !== sorted.length || sorted.some((date, index) => date !== dataset.dates[index])) {
    throw new Error("Long Game dates must be unique and sorted.");
  }
  const building = sorted.filter((date) => date >= from && date <= to);
  if (!building.length) throw new Error(`Long Game has no NIFTY sessions in ${from} through ${to}.`);
  if (from === LONGTERM_BUILDING_FROM && building[0] > "2011-01-10") {
    throw new Error(`Long Game exact building start is incomplete; first session is ${building[0]}.`);
  }
  if (to === LONGTERM_BUILDING_TO && building.at(-1)! < "2023-12-20") {
    throw new Error(`Long Game exact building end is incomplete; last session is ${building.at(-1)}.`);
  }
  const warmup = sorted.filter((date) => date < from);
  if (warmup.length < 240) throw new Error(`Long Game requires 240 pre-window NIFTY sessions; found ${warmup.length}.`);
  for (const key of new Set(Object.values(variant.series))) {
    const required = key === "nifty_1d_rate" ? building : [...warmup, ...building];
    const missing = required.filter((date) => {
      const value = dataset.values[key as LongtermSeriesKey].get(date);
      return value == null || !Number.isFinite(value) || value <= 0;
    });
    if (missing.length) throw new Error(`${key} is missing ${missing[0]}; no forward-fill is allowed.`);
  }
}

function resolveOptions(options: LongtermSimulationOptions): ResolvedOptions {
  const from = options.window?.from ?? LONGTERM_BUILDING_FROM;
  const to = options.window?.to ?? LONGTERM_BUILDING_TO;
  return {
    initialCapital: options.initialCapital ?? 100_000,
    costs: { ...DEFAULT_LONGTERM_COSTS, ...options.costs },
    drag: { ...DEFAULT_LONGTERM_DRAG, ...options.drag },
    tax: {
      ...DEFAULT_LONGTERM_TAX,
      ...options.tax,
      equity: { ...DEFAULT_LONGTERM_TAX.equity, ...options.tax?.equity },
      nonEquity: { ...DEFAULT_LONGTERM_TAX.nonEquity, ...options.tax?.nonEquity },
    },
    riskFreeAnnual: options.riskFreeAnnual ?? 0.06,
    from,
    to,
  };
}

function taxForGain(
  sleeve: RiskySleeve,
  gain: number,
  holdingDays: number,
  year: string,
  config: LongtermTaxConfig,
  exemptionUsed: Map<string, number>
): number {
  if (sleeve === "nifty50" || sleeve === "secondary") {
    if (holdingDays < config.equity.longTermDays) return gain * config.equity.shortRate;
    const used = exemptionUsed.get(year) ?? 0;
    const exemption = Math.max(0, config.equity.annualExemption - used);
    const exempt = Math.min(exemption, gain);
    exemptionUsed.set(year, used + exempt);
    return (gain - exempt) * config.equity.longRate;
  }
  return gain * (holdingDays < config.nonEquity.longTermDays ? config.nonEquity.shortRate : config.nonEquity.longRate);
}

function emptySleeveState(): SleeveState {
  return {
    units: 0,
    lots: [],
    arm: "none",
    stage: 0,
    stage1Close: 0,
    stage1Week: -1,
    lastStageWeek: -1,
    warningStreak: 0,
  };
}

function zeroSleeves(): Record<Sleeve, number> {
  return { nifty50: 0, secondary: 0, gold: 0, liquid: 0 };
}

function weights(values: Record<Sleeve, number>): Record<Sleeve, number> {
  const total = sum(Object.values(values));
  return Object.fromEntries(SLEEVES.map((sleeve) => [sleeve, total > 0 ? values[sleeve] / total : 0])) as Record<Sleeve, number>;
}

function metricStress(metrics: LongtermMetrics): Pick<LongtermMetrics, "endingValue" | "cagrPct" | "maxDrawdown"> {
  return { endingValue: metrics.endingValue, cagrPct: metrics.cagrPct, maxDrawdown: metrics.maxDrawdown };
}

function ema(values: number[], period: number): number {
  const alpha = 2 / (period + 1);
  let value = values[0];
  for (let index = 1; index < values.length; index++) value = values[index] * alpha + value * (1 - alpha);
  return value;
}

function weekSerial(date: string): number {
  const value = new Date(`${date}T00:00:00Z`);
  const day = (value.getUTCDay() + 6) % 7;
  return Math.floor((value.getTime() - day * DAY) / (7 * DAY));
}

function shiftYears(date: string, years: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY));
}

function pct(value: number): number {
  return value * 100;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(sum(values.map((value) => (value - mean) ** 2)) / (values.length - 1));
}

function lastIndex<T>(values: T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index--) if (predicate(values[index])) return index;
  return -1;
}

function lastMatching<T>(values: T[], predicate: (value: T) => boolean): T | undefined {
  const index = lastIndex(values, predicate);
  return index >= 0 ? values[index] : undefined;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
