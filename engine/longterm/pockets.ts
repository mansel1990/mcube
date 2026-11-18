export type Pocket = "core" | "radar";

export type ScopedHolding = {
  book: string | null;
  qty: number;
  avg: number;
  closed?: boolean;
};

/** Swing cost ignores Intraday and Long Game rows. Null book stays swing, matching the column default. */
export function swingScopedCost(rows: readonly ScopedHolding[]): number {
  return rows
    .filter((row) => !row.closed && (row.book ?? "swing") === "swing")
    .reduce((sum, row) => sum + row.qty * row.avg, 0);
}

export function swingScopedPending(rows: readonly { book: string | null; notional: number }[]): number {
  return rows.filter((row) => (row.book ?? "swing") === "swing").reduce((sum, row) => sum + row.notional, 0);
}

export function remainingUnassigned(kiteUnits: number, attributedUnits: number): number {
  return Math.max(0, kiteUnits - attributedUnits);
}

export function registrationError(units: number, remaining: number): string | null {
  if (!(units > 0) || !Number.isInteger(units)) return "Units must be a whole number above zero.";
  if (units > remaining) return "That is more than the unassigned Kite units.";
  return null;
}

export function openingContribution(units: number, averagePrice: number): { moneyAdded: number; cash: number } {
  return { moneyAdded: roundMoney(units * averagePrice), cash: 0 };
}

export type IncomeSplit = { core: number; radar: number; note: string };

/** Whole units. The larger fractional part gets the remainder. A tie goes to Core. */
export function allocateIncomeUnits(coreBefore: number, radarBefore: number, incoming: number): IncomeSplit {
  const total = coreBefore + radarBefore;
  if (!(incoming > 0) || !Number.isInteger(incoming)) {
    return { core: 0, radar: 0, note: "Income units must be a positive whole number." };
  }
  if (total <= 0) return { core: 0, radar: 0, note: "No pocket held the liquid ETF before the dividend." };
  const coreExact = (incoming * coreBefore) / total;
  const radarExact = (incoming * radarBefore) / total;
  let core = Math.floor(coreExact);
  let radar = Math.floor(radarExact);
  let left = incoming - core - radar;
  if (left > 0 && coreExact - core >= radarExact - radar) core += left;
  else radar += left;
  left = 0;
  return {
    core,
    radar,
    note: `Before core ${coreBefore}, radar ${radarBefore}. Incoming ${incoming}. Core receives ${core}, radar receives ${radar}.`,
  };
}

export function reductionAttribution(owners: readonly { pocket: Pocket; units: number }[]): {
  preselect: Pocket | null;
  needsSplit: boolean;
} {
  const holding = owners.filter((row) => row.units > 0);
  if (holding.length === 1) return { preselect: holding[0].pocket, needsSplit: false };
  if (holding.length > 1) return { preselect: null, needsSplit: true };
  return { preselect: null, needsSplit: false };
}

export type FifoLot = { id: number; qty: number; price: number; acquiredOn: string };

export function closeFifo(lots: readonly FifoLot[], qty: number, sellPrice: number, soldOn: string): {
  closed: { id: number; qty: number; cost: number; proceeds: number; gain: number; term: "short" | "long" }[];
  realised: number;
  unfilled: number;
} {
  const ordered = [...lots].sort((a, b) => a.acquiredOn.localeCompare(b.acquiredOn) || a.id - b.id);
  const closed: { id: number; qty: number; cost: number; proceeds: number; gain: number; term: "short" | "long" }[] = [];
  let left = qty;
  for (const lot of ordered) {
    if (left <= 0) break;
    const take = Math.min(lot.qty, left);
    if (take <= 0) continue;
    const cost = roundMoney(take * lot.price);
    const proceeds = roundMoney(take * sellPrice);
    const gain = roundMoney(proceeds - cost);
    closed.push({
      id: lot.id,
      qty: take,
      cost,
      proceeds,
      gain,
      term: daysBetween(lot.acquiredOn, soldOn) >= 365 ? "long" : "short",
    });
    left -= take;
  }
  return {
    closed,
    realised: roundMoney(closed.reduce((sum, row) => sum + row.gain, 0)),
    unfilled: left,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}
