/**
 * Independent STATIC reconstruction.
 * This module must not import engine/longterm/simulate.ts.
 * It repeats the next-session March annual and 5-point month-end drift convention.
 */
import {
  LONGTERM_BUILDING_FROM,
  LONGTERM_BUILDING_TO,
  type LongtermDataset,
  type LongtermSeriesKey,
} from "./data";
import {
  DEFAULT_LONGTERM_COSTS,
  DEFAULT_LONGTERM_DRAG,
  DEFAULT_REPRESENTATIVE_ETFS,
  getLongtermVariant,
  type LongtermCostConfig,
  type LongtermDragConfig,
  type Sleeve,
} from "./variants";

const RISKY = ["nifty50", "secondary", "gold"] as const;
const SLEEVES: Sleeve[] = ["nifty50", "secondary", "gold", "liquid"];
type RiskySleeve = (typeof RISKY)[number];

export type StaticReplayPoint = {
  date: string;
  value: number;
  drawdownPct: number;
  weights: Record<Sleeve, number>;
  values: Record<Sleeve, number>;
};

export type StaticReplay = {
  variant: "STATIC-NEXT" | "STATIC-MID";
  equity: StaticReplayPoint[];
  maxDrawdown: { pct: number; peakDate: string; troughDate: string; peakValue: number; troughValue: number };
  annualRebalances: number;
  driftRebalances: number;
};

type ReplayOptions = {
  from?: string;
  to?: string;
  initialCapital?: number;
  costs?: Partial<LongtermCostConfig>;
  drag?: Partial<LongtermDragConfig>;
};

export function replayStatic(
  dataset: LongtermDataset,
  variantName: "STATIC-NEXT" | "STATIC-MID",
  options: ReplayOptions = {}
): StaticReplay {
  const variant = getLongtermVariant(variantName);
  if (variant.kind !== "static") throw new Error("STATIC replay only accepts STATIC variants.");
  const from = options.from ?? LONGTERM_BUILDING_FROM;
  const to = options.to ?? LONGTERM_BUILDING_TO;
  const initialCapital = options.initialCapital ?? 100_000;
  const costs = { ...DEFAULT_LONGTERM_COSTS, ...options.costs };
  const drag = { ...DEFAULT_LONGTERM_DRAG, ...options.drag };
  const allDates = dataset.dates.filter((date) => date <= to);
  const fromIndex = allDates.findIndex((date) => date >= from);
  const toIndex = lastIndex(allDates, (date) => date <= to);
  if (fromIndex < 0 || toIndex < fromIndex) throw new Error(`STATIC replay has no sessions in ${from} through ${to}.`);
  const prices = buildPrices(dataset, variant.series, allDates, drag);
  const units: Record<RiskySleeve, number> = { nifty50: 0, secondary: 0, gold: 0 };
  let liquidUnits = initialCapital / prices.liquid[fromIndex];
  const monthEnd = allDates.map((date, index) => index === allDates.length - 1 || allDates[index + 1].slice(0, 7) !== date.slice(0, 7));
  const pending: { executeAt: number; signalDate: string; kind: "initial" | "annual" | "drift" }[] = [
    { executeAt: fromIndex, signalDate: allDates[fromIndex], kind: "initial" },
  ];
  const equity: StaticReplayPoint[] = [];
  let annualRebalances = 0;
  let driftRebalances = 0;

  const valuesAt = (index: number): Record<Sleeve, number> => ({
    nifty50: units.nifty50 * prices.nifty50[index],
    secondary: units.secondary * prices.secondary[index],
    gold: units.gold * prices.gold[index],
    liquid: liquidUnits * prices.liquid[index],
  });
  const totalAt = (index: number): number => SLEEVES.reduce((total, sleeve) => total + valuesAt(index)[sleeve], 0);

  const takeLiquid = (amount: number, index: number): number => {
    const available = liquidUnits * prices.liquid[index];
    const taken = Math.max(0, Math.min(amount, available));
    liquidUnits -= taken / prices.liquid[index];
    return taken;
  };
  const addLiquid = (amount: number, index: number): void => {
    liquidUnits += amount / prices.liquid[index];
  };

  const buy = (sleeve: RiskySleeve, cashBudget: number, index: number): void => {
    const total = totalAt(index);
    const current = valuesAt(index)[sleeve];
    const lossRate = costs.transactionCostPct + costs.slippagePct;
    const target = variant.targets[sleeve];
    const liquidTarget = variant.targets.liquid;
    const capNotional = Math.max(0, (target * total - current) / (1 + target * lossRate));
    const liquidNotional = Math.max(0, (valuesAt(index).liquid - liquidTarget * total) / (1 + lossRate * (1 - liquidTarget)));
    const baseNotional = Math.min(cashBudget / (1 + lossRate), capNotional, liquidNotional);
    if (baseNotional <= 1e-9) return;
    const bought = baseNotional / prices[sleeve][index];
    if (bought <= 0) return;
    const fee = baseNotional * costs.transactionCostPct;
    const slip = baseNotional * costs.slippagePct;
    const spent = takeLiquid(baseNotional + fee + slip, index);
    if (spent + 1e-7 < baseNotional + fee + slip) throw new Error("STATIC replay buy exceeded liquid residual.");
    units[sleeve] += bought;
  };

  const sell = (sleeve: RiskySleeve, requestedUnits: number, index: number): void => {
    const soldUnits = Math.min(units[sleeve], requestedUnits);
    if (soldUnits <= 1e-12) return;
    const gross = soldUnits * prices[sleeve][index];
    const fee = gross * costs.transactionCostPct;
    const slip = gross * costs.slippagePct;
    units[sleeve] -= soldUnits;
    addLiquid(gross - fee - slip, index);
  };

  const rebalance = (index: number): void => {
    const before = totalAt(index);
    const desired = Object.fromEntries(RISKY.map((sleeve) => [sleeve, before * variant.targets[sleeve]])) as Record<RiskySleeve, number>;
    for (const sleeve of RISKY) {
      const current = valuesAt(index)[sleeve];
      if (current > desired[sleeve] + 1e-8) sell(sleeve, (current - desired[sleeve]) / prices[sleeve][index], index);
    }
    for (const sleeve of RISKY) {
      const current = valuesAt(index)[sleeve];
      if (current < desired[sleeve] - 1e-8) buy(sleeve, desired[sleeve] - current, index);
    }
  };

  for (let index = fromIndex; index <= toIndex; index++) {
    for (const item of pending) {
      if (item.executeAt === index) rebalance(index);
    }
    for (let cursor = pending.length - 1; cursor >= 0; cursor--) {
      if (pending[cursor].executeAt === index) pending.splice(cursor, 1);
    }
    const currentValues = valuesAt(index);
    const total = SLEEVES.reduce((sum, sleeve) => sum + currentValues[sleeve], 0);
    const weights = Object.fromEntries(SLEEVES.map((sleeve) => [sleeve, total > 0 ? currentValues[sleeve] / total : 0])) as Record<Sleeve, number>;
    equity.push({ date: allDates[index], value: total, drawdownPct: 0, weights, values: currentValues });
    if (index < toIndex && monthEnd[index]) {
      const month = allDates[index].slice(5, 7);
      const drifted = SLEEVES.some((sleeve) => Math.abs(weights[sleeve] - variant.targets[sleeve]) > 0.05 + 1e-12);
      if (month === "03") {
        annualRebalances += 1;
        pending.push({ executeAt: index + 1, signalDate: allDates[index], kind: "annual" });
      } else if (drifted) {
        driftRebalances += 1;
        pending.push({ executeAt: index + 1, signalDate: allDates[index], kind: "drift" });
      }
    }
  }

  let peak = 0;
  for (const point of equity) {
    peak = Math.max(peak, point.value);
    point.drawdownPct = peak > 0 ? (1 - point.value / peak) * 100 : 0;
  }
  return {
    variant: variantName,
    equity,
    maxDrawdown: maxDrawdown(equity),
    annualRebalances,
    driftRebalances,
  };
}

function maxDrawdown(equity: StaticReplayPoint[]): StaticReplay["maxDrawdown"] {
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
  return {
    pct: worst * 100,
    peakDate: equity[worstPeak]?.date ?? equity[0].date,
    troughDate: equity[trough]?.date ?? equity[0].date,
    peakValue: equity[worstPeak]?.value ?? equity[0].value,
    troughValue: equity[trough]?.value ?? equity[0].value,
  };
}

function buildPrices(
  dataset: LongtermDataset,
  series: Record<Sleeve, LongtermSeriesKey>,
  dates: string[],
  drag: LongtermDragConfig
): Record<Sleeve, number[]> {
  const out = {} as Record<Sleeve, number[]>;
  for (const sleeve of SLEEVES) {
    const values = dataset.values[series[sleeve]];
    const firstDate = dates.find((date) => values.has(date));
    if (!firstDate) throw new Error(`${series[sleeve]} has no usable values.`);
    const first = values.get(firstDate)!;
    const base = sleeve === "liquid" ? 100 : DEFAULT_REPRESENTATIVE_ETFS[sleeve].currentPrice;
    out[sleeve] = dates.map((date) => {
      const raw = values.get(date);
      if (raw == null) return base;
      const elapsedYears = dayDiff(firstDate, date) / 365.2425;
      const annualDrag = sleeve === "liquid" ? 0 : drag[sleeve];
      return base * (raw / first) * Math.pow(1 - annualDrag, elapsedYears);
    });
  }
  return out;
}

function dayDiff(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}

function lastIndex<T>(values: T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index--) if (predicate(values[index])) return index;
  return -1;
}
