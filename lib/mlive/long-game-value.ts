import { addDays } from "./calendar";
import { assumedLongTermDate } from "./acquisition";
import { DEFAULT_LONGTERM_TAX, type LongtermTaxConfig } from "../../engine/longterm/variants";

export const PRICE_AT_COST = "Price unavailable — shown at cost";
export const CHART_LIVE_NOTE = "Chart uses daily closes; the total above may use a newer Kite mark.";

export const LONG_GAME_CHART_COLOURS = {
  value: "#F2A20C",
  moneyAdded: "#14161C",
  nifty: "#2F6FB5",
} as const;

const EQUITY = new Set(["NIFTYBEES", "MID150BEES", "JUNIORBEES"]);

const SLEEVE: Record<string, { key: string; name: string }> = {
  NIFTYBEES: { key: "nifty", name: "Nifty 50" },
  MID150BEES: { key: "secondary", name: "Midcap 150" },
  JUNIORBEES: { key: "secondary", name: "Next 50" },
  GOLDBEES: { key: "gold", name: "Gold" },
  LIQUIDBEES: { key: "liquid", name: "Liquid" },
};

export type PriceSource = "daily_close" | "kite_holding" | "prior_close" | "cost";

export type DailyClose = { date: string; close: number };

export type ResolvedPrice = {
  price: number;
  source: PriceSource;
  at: string | null;
  atCost: boolean;
  label: string | null;
};

export type Flow = { date: string; amount: number; kind: "contribution" | "withdrawal" };

export type ChartPoint = {
  date: string;
  value: number | null;
  moneyAdded: number;
  nifty: number | null;
};

export type HoldingInput = { pocket: string; symbol: string; units: number; average: number };

export type LedgerInput = {
  kind: string;
  amount: number;
  pocket: string;
  symbol?: string | null;
  units?: number;
  createdAt: string;
};

export type LotInput = {
  id: number;
  pocket: string;
  symbol: string;
  qtyOpen: number;
  qtyOriginal: number;
  price: number;
  acquiredOn: string;
  acquisitionDate: string | null;
  taxDateAssumption: string;
  registeredOn: string | null;
  estimated: boolean;
};

export type MarkInput = { symbol: string; price: number; observedAt: string };

export type CloseInput = { symbol: string; date: string; close: number };

export function istParts(iso: string): { date: string; time: string } {
  const when = new Date(iso);
  const date = when.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(when);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return { date, time: `${hour === "24" ? "00" : hour}:${minute}` };
}

export function formatLongDate(iso: string): string {
  const [year, month, date] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !date) return iso;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatInr(value: number): string {
  const rounded = Math.round(value);
  return `₹${(rounded === 0 ? 0 : rounded).toLocaleString("en-IN")}`;
}

export function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "₹0";
  return `₹${rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatSignedInr(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "₹0";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}₹${Math.abs(rounded).toLocaleString("en-IN")}`;
}

export function formatSignedMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "₹0";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(rounded))}`;
}

export function formatSignedPct(value: number, digits = 1): string {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded).toFixed(digits)}%`;
}

export function formatPp(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "vs Nifty: 0.0 pp";
  const sign = rounded > 0 ? "+" : "−";
  return `vs Nifty: ${sign}${Math.abs(rounded).toFixed(1)} pp`;
}

export function formatPrice(value: number): string {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function dayOf(value: string): string {
  return value.slice(0, 10);
}

function sortedCloses(closes: readonly DailyClose[]): DailyClose[] {
  return closes
    .filter((row) => row.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Today's official close, then today's Kite mark, then an earlier close, then cost. */
export function resolveLongGamePrice(input: {
  today: string;
  closes: readonly DailyClose[];
  kite: { price: number; observedAt: string } | null;
  averageCost: number;
}): ResolvedPrice {
  const closes = sortedCloses(input.closes);
  const todayClose = [...closes].reverse().find((row) => row.date === input.today);
  if (todayClose) {
    return { price: todayClose.close, source: "daily_close", at: todayClose.date, atCost: false, label: null };
  }
  if (input.kite && input.kite.price > 0 && istParts(input.kite.observedAt).date === input.today) {
    return { price: input.kite.price, source: "kite_holding", at: input.kite.observedAt, atCost: false, label: null };
  }
  const prior = [...closes].reverse().find((row) => row.date < input.today);
  if (prior) {
    return { price: prior.close, source: "prior_close", at: prior.date, atCost: false, label: null };
  }
  return { price: input.averageCost, source: "cost", at: null, atCost: true, label: PRICE_AT_COST };
}

export function pricesAsOf(rows: readonly { symbol: string; price: ResolvedPrice }[]): string {
  const market = rows.filter((row) => !row.price.atCost && row.price.at);
  if (market.length === 0) return PRICE_AT_COST;
  const dated = market.map((row) => {
    const at = row.price.at ?? "";
    const day = row.price.source === "kite_holding" ? istParts(at).date : dayOf(at);
    return { ...row, day };
  });
  const oldest = dated.reduce((left, right) => (left.day < right.day ? left : right));
  const kites = dated.filter((row) => row.price.source === "kite_holding");
  if (kites.length === 0) return `Prices as of ${formatLongDate(oldest.day)}`;
  const days = [...new Set(dated.map((row) => row.day))];
  if (kites.length === dated.length && days.length === 1) {
    const time = istParts(kites[0]?.price.at ?? "").time;
    return `Prices as of ${formatLongDate(days[0])}, ${time}`;
  }
  const bits = kites.map((row) => `${row.symbol} read from Kite at ${istParts(row.price.at ?? "").time}`);
  return `Prices through ${formatLongDate(oldest.day)} · ${bits.join(" · ")}`;
}

export function chartNeedsLiveNote(prices: readonly ResolvedPrice[]): boolean {
  return prices.some((price) => price.source === "kite_holding");
}

export function gainContribution(holdingGain: number, totalGain: number): number | null {
  if (totalGain === 0) return null;
  return (holdingGain / totalGain) * 100;
}

function sleeveOf(symbol: string): { key: string; name: string } {
  return SLEEVE[symbol] ?? { key: "other", name: symbol };
}

export function preciseAverage(holding: HoldingInput, ledger: readonly LedgerInput[]): number {
  const openings = ledger.filter((row) =>
    row.kind === "opening_holding"
    && row.pocket === holding.pocket
    && String(row.symbol ?? "").toUpperCase() === holding.symbol
  );
  const units = openings.reduce((sum, row) => sum + (row.units ?? 0), 0);
  const money = openings.reduce((sum, row) => sum + row.amount, 0);
  if (units > 0 && Math.abs(units - holding.units) < 0.0001 && money > 0) return money / units;
  return holding.average;
}

export function externalFlows(input: { lots: readonly { date: string; units: number; price: number }[]; ledger: readonly LedgerInput[] }): Flow[] {
  const flows: Flow[] = [];
  const openings = input.ledger.filter((row) => row.kind === "opening_holding" && row.amount > 0);
  const openingMoney = openings.reduce((sum, row) => sum + row.amount, 0);
  const rawLots = input.lots.map((lot) => ({ date: dayOf(lot.date), amount: lot.units * lot.price })).filter((lot) => lot.amount > 0);
  const lotMoney = rawLots.reduce((sum, lot) => sum + lot.amount, 0);
  const scale = rawLots.length > 0 && openingMoney > 0 && lotMoney > 0 && Math.abs(lotMoney - openingMoney) < 1
    ? openingMoney / lotMoney
    : 1;
  for (const lot of rawLots) flows.push({ date: lot.date, amount: lot.amount * scale, kind: "contribution" });
  const lotsCoverOpening = rawLots.length > 0;
  for (const row of input.ledger) {
    const date = dayOf(row.createdAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (row.kind === "deposit" && row.amount > 0) flows.push({ date, amount: row.amount, kind: "contribution" });
    else if (row.kind === "withdrawal" && row.amount > 0) flows.push({ date, amount: row.amount, kind: "withdrawal" });
    else if (!lotsCoverOpening && row.kind === "opening_holding" && row.amount > 0) flows.push({ date, amount: row.amount, kind: "contribution" });
  }
  return flows.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export function cumulativeReturn(endingValue: number, withdrawals: number, contributions: number): number | null {
  if (!(contributions > 0)) return null;
  return ((endingValue + withdrawals - contributions) / contributions) * 100;
}

function closeOnOrAfter(closes: readonly DailyClose[], date: string): DailyClose | null {
  return sortedCloses(closes).find((row) => row.date >= date) ?? null;
}

export type ShadowResult = {
  units: number;
  value: number;
  contributions: number;
  withdrawals: number;
  returnPct: number | null;
  adjustments: { flowDate: string; usedDate: string }[];
  series: { date: string; value: number; units: number }[];
};

/** Same external cash buys and sells fractional Nifty 50 units. Internal trades never reach this book. */
export function niftyShadow(flows: readonly Flow[], closes: readonly DailyClose[]): ShadowResult {
  const book = sortedCloses(closes);
  const adjustments: { flowDate: string; usedDate: string }[] = [];
  const events: { date: string; units: number }[] = [];
  for (const flow of flows) {
    const close = closeOnOrAfter(book, flow.date);
    if (!close) continue;
    if (close.date !== flow.date) adjustments.push({ flowDate: flow.date, usedDate: close.date });
    const units = flow.amount / close.close;
    events.push({ date: close.date, units: flow.kind === "withdrawal" ? -units : units });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  let cursor = 0;
  let units = 0;
  const series: { date: string; value: number; units: number }[] = [];
  for (const close of book) {
    while (cursor < events.length && events[cursor].date <= close.date) {
      units += events[cursor].units;
      cursor += 1;
    }
    series.push({ date: close.date, value: units * close.close, units });
  }
  const contributions = flows.filter((flow) => flow.kind === "contribution").reduce((sum, flow) => sum + flow.amount, 0);
  const withdrawals = flows.filter((flow) => flow.kind === "withdrawal").reduce((sum, flow) => sum + flow.amount, 0);
  const value = series.at(-1)?.value ?? 0;
  return {
    units,
    value,
    contributions,
    withdrawals,
    returnPct: cumulativeReturn(value, withdrawals, contributions),
    adjustments,
    series,
  };
}

export type ValuedHolding = {
  pocket: string;
  symbol: string;
  sleeve: string;
  sleeveName: string;
  units: number;
  average: number;
  invested: number;
  price: number;
  priceSource: PriceSource;
  priceAt: string | null;
  atCost: boolean;
  priceLabel: string | null;
  value: number;
  gain: number;
  gainPct: number | null;
  contribution: number | null;
};

export function valueHoldings(rows: readonly HoldingInput[], prices: ReadonlyMap<string, ResolvedPrice>, totalGain?: number): ValuedHolding[] {
  const valued = rows.filter((row) => row.pocket === "core" && row.units > 0).map((row) => {
    const price = prices.get(row.symbol) ?? resolveLongGamePrice({ today: "1970-01-01", closes: [], kite: null, averageCost: row.average });
    const invested = row.units * row.average;
    const value = row.units * price.price;
    const gain = value - invested;
    return {
      pocket: row.pocket,
      symbol: row.symbol,
      sleeve: sleeveOf(row.symbol).key,
      sleeveName: sleeveOf(row.symbol).name,
      units: row.units,
      average: row.average,
      invested,
      price: price.price,
      priceSource: price.source,
      priceAt: price.at,
      atCost: price.atCost,
      priceLabel: price.label,
      value,
      gain,
      gainPct: invested > 0 ? (gain / invested) * 100 : null,
      contribution: null as number | null,
    };
  });
  const total = totalGain ?? valued.reduce((sum, row) => sum + row.gain, 0);
  return valued.map((row) => ({ ...row, contribution: gainContribution(row.gain, total) }));
}

export type PresentedLot = {
  id: number;
  symbol: string;
  date: string;
  units: number;
  price: number;
  cost: number;
  value: number;
  gain: number;
  gainPct: number | null;
  longTermDate: string;
  quality: "Estimated" | "Assumed" | null;
};

export function presentLot(lot: LotInput, mark: number, tax: LongtermTaxConfig = DEFAULT_LONGTERM_TAX): PresentedLot {
  const units = lot.qtyOpen;
  const cost = units * lot.price;
  const value = units * mark;
  const gain = value - cost;
  const basis = lot.acquisitionDate ?? lot.acquiredOn;
  const days = EQUITY.has(lot.symbol) ? tax.equity.longTermDays : tax.nonEquity.longTermDays;
  const longTermDate = lot.taxDateAssumption === "registration_plus_12_months"
    ? assumedLongTermDate(lot.registeredOn ?? lot.acquiredOn)
    : addDays(basis, days);
  const quality = lot.taxDateAssumption === "tradebook"
    ? null
    : lot.taxDateAssumption === "registration_plus_12_months"
      ? "Assumed"
      : "Estimated";
  return {
    id: lot.id,
    symbol: lot.symbol,
    date: lot.acquiredOn,
    units,
    price: lot.price,
    cost,
    value,
    gain,
    gainPct: cost > 0 ? (gain / cost) * 100 : null,
    longTermDate,
    quality,
  };
}

export function presentLots(lots: readonly LotInput[], marks: ReadonlyMap<string, number>, tax?: LongtermTaxConfig): PresentedLot[] {
  return lots
    .filter((lot) => lot.pocket === "core" && lot.qtyOpen > 0)
    .slice()
    .sort((a, b) => a.acquiredOn.localeCompare(b.acquiredOn) || a.id - b.id)
    .map((lot) => presentLot(lot, marks.get(lot.symbol) ?? lot.price, tax));
}

type UnitEvent = { symbol: string; date: string; units: number };

function unitsOn(symbol: string, date: string, lots: readonly UnitEvent[], incomes: readonly UnitEvent[], sales: readonly UnitEvent[]): number {
  const add = (rows: readonly UnitEvent[]) => rows.filter((row) => row.symbol === symbol && row.date <= date).reduce((sum, row) => sum + row.units, 0);
  return add(lots) + add(incomes) - add(sales);
}

function carriedClose(closes: readonly DailyClose[], date: string): number | null {
  const known = sortedCloses(closes).filter((row) => row.date <= date);
  return known.length ? known[known.length - 1].close : null;
}

export function buildLongGameHistory(input: {
  sessions: readonly string[];
  lots: readonly { symbol: string; date: string; units: number; price: number }[];
  incomes?: readonly UnitEvent[];
  sales?: readonly UnitEvent[];
  flows: readonly Flow[];
  closes: Readonly<Record<string, readonly DailyClose[]>>;
  nifty: readonly DailyClose[];
}): ChartPoint[] {
  const firstFlow = input.flows.map((flow) => flow.date).sort()[0];
  const sessions = [...new Set(input.sessions.map(dayOf))]
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && (!firstFlow || day >= firstFlow))
    .sort();
  const lots = input.lots.map((lot) => ({ symbol: lot.symbol, date: dayOf(lot.date), units: lot.units }));
  const incomes = input.incomes ?? [];
  const sales = input.sales ?? [];
  const symbols = [...new Set(lots.map((lot) => lot.symbol))];
  const shadow = niftyShadow(input.flows, input.nifty);
  const niftyByDate = new Map(shadow.series.map((row) => [row.date, row.value]));
  let carriedNifty: number | null = null;
  return sessions.map((date) => {
    let moneyAdded = 0;
    for (const flow of input.flows) {
      if (flow.date > date) continue;
      moneyAdded += flow.kind === "withdrawal" ? -flow.amount : flow.amount;
    }
    const active = symbols.filter((symbol) => unitsOn(symbol, date, lots, incomes, sales) > 0);
    let value = 0;
    let priced = active.length > 0;
    for (const symbol of active) {
      const close = carriedClose(input.closes[symbol] ?? [], date);
      if (close == null) {
        priced = false;
        break;
      }
      value += unitsOn(symbol, date, lots, incomes, sales) * close;
    }
    const marked: number | null = active.length === 0 ? 0 : priced ? value : null;
    const niftyClose = sortedCloses(input.nifty).filter((row) => row.date <= date).at(-1);
    if (niftyClose && niftyByDate.has(niftyClose.date)) carriedNifty = niftyByDate.get(niftyClose.date) ?? carriedNifty;
    const nifty = niftyClose ? carriedNifty : null;
    return { date, value: marked, moneyAdded, nifty };
  });
}

export function chartRangeStart(today: string, range: "3M" | "1Y" | "All"): string | null {
  if (range === "All") return null;
  const [year, month, date] = today.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + (range === "3M" ? -3 : -12), date));
  return shifted.toISOString().slice(0, 10);
}

/** Keeps the session just before the window so a step and a return do not start from a flat zero. */
export function sliceChart(points: readonly ChartPoint[], range: "3M" | "1Y" | "All", today: string): ChartPoint[] {
  const start = chartRangeStart(today, range);
  if (!start) return [...points];
  const first = points.findIndex((point) => point.date >= start);
  if (first === -1) return points.length ? [points[points.length - 1]] : [];
  return points.slice(first > 0 ? first - 1 : first);
}

export type LongGamePresentation = {
  value: number;
  invested: number;
  moneyAdded: number;
  withdrawals: number;
  cash: number;
  gain: number;
  gainPct: number | null;
  longReturnPct: number | null;
  niftyReturnPct: number | null;
  vsNiftyPp: number | null;
  niftyAdjustments: { flowDate: string; usedDate: string }[];
  priceCaption: string;
  pricesAtCost: boolean;
  chartNote: string | null;
  holdings: ValuedHolding[];
  lots: PresentedLot[];
  chart: ChartPoint[];
};

export function buildLongGamePresentation(input: {
  today: string;
  holdings: readonly HoldingInput[];
  ledger: readonly LedgerInput[];
  lots: readonly LotInput[];
  marks: readonly MarkInput[];
  closes: readonly CloseInput[];
  nifty: readonly DailyClose[];
  sessions: readonly string[];
  cash: number;
  pricesUnavailable?: boolean;
}): LongGamePresentation {
  const core = input.holdings.filter((row) => row.pocket === "core");
  const priced: HoldingInput[] = core.map((row) => ({ ...row, symbol: row.symbol.toUpperCase(), average: preciseAverage(row, input.ledger) }));
  const closesBySymbol = new Map<string, DailyClose[]>();
  if (!input.pricesUnavailable) {
    for (const row of input.closes) {
      const symbol = row.symbol.toUpperCase();
      const list = closesBySymbol.get(symbol) ?? [];
      list.push({ date: dayOf(row.date), close: row.close });
      closesBySymbol.set(symbol, list);
    }
  }
  const marks = new Map(input.pricesUnavailable ? [] : input.marks.map((row) => [row.symbol.toUpperCase(), row]));
  const resolved = new Map<string, ResolvedPrice>();
  for (const row of priced) {
    const kite = marks.get(row.symbol);
    resolved.set(row.symbol, resolveLongGamePrice({
      today: input.today,
      closes: closesBySymbol.get(row.symbol) ?? [],
      kite: kite && kite.price > 0 ? { price: kite.price, observedAt: kite.observedAt } : null,
      averageCost: row.average,
    }));
  }
  const holdings = valueHoldings(priced, resolved, undefined);
  const openLots = input.lots.filter((lot) => lot.pocket === "core");
  const flows = externalFlows({
    lots: openLots.map((lot) => ({ date: lot.acquiredOn, units: lot.qtyOriginal, price: lot.price })),
    ledger: input.ledger.filter((row) => row.pocket === "core"),
  });
  const contributions = flows.filter((flow) => flow.kind === "contribution").reduce((sum, flow) => sum + flow.amount, 0);
  const withdrawals = flows.filter((flow) => flow.kind === "withdrawal").reduce((sum, flow) => sum + flow.amount, 0);
  const invested = holdings.reduce((sum, row) => sum + row.invested, 0);
  const holdingValue = holdings.reduce((sum, row) => sum + row.value, 0);
  const value = holdingValue + input.cash;
  const gain = value + withdrawals - contributions;
  const shadow = niftyShadow(flows, input.pricesUnavailable ? [] : input.nifty);
  const longReturnPct = cumulativeReturn(value, withdrawals, contributions);
  const prices = holdings.map((row) => resolved.get(row.symbol)!);
  const markedToMarket = holdings.length > 0 && prices.every((price) => !price.atCost);
  const vsNiftyPp = markedToMarket && longReturnPct != null && shadow.returnPct != null ? longReturnPct - shadow.returnPct : null;
  const markBySymbol = new Map(holdings.map((row) => [row.symbol, row.price]));
  const openingMoney = input.ledger
    .filter((row) => row.pocket === "core" && row.kind === "opening_holding" && row.amount > 0)
    .reduce((sum, row) => sum + row.amount, 0);
  const rawLotMoney = openLots.reduce((sum, lot) => sum + lot.qtyOriginal * lot.price, 0);
  const lotScale = rawLotMoney > 0 && openingMoney > 0 && Math.abs(rawLotMoney - openingMoney) < 1 ? openingMoney / rawLotMoney : 1;
  const displayLots = openLots.map((lot) => {
    const openCost = lot.qtyOriginal > 0 ? lot.qtyOriginal * lot.price * lotScale * (lot.qtyOpen / lot.qtyOriginal) : 0;
    return { ...lot, price: lot.qtyOpen > 0 ? openCost / lot.qtyOpen : lot.price };
  });
  const incomes: UnitEvent[] = input.ledger
    .filter((row) => row.pocket === "core" && row.kind === "income_units" && (row.units ?? 0) > 0)
    .map((row) => ({ symbol: String(row.symbol ?? "").toUpperCase(), date: dayOf(row.createdAt), units: row.units ?? 0 }));
  const sales: UnitEvent[] = input.ledger
    .filter((row) => row.pocket === "core" && row.kind === "sale_proceeds" && (row.units ?? 0) > 0)
    .map((row) => ({ symbol: String(row.symbol ?? "").toUpperCase(), date: dayOf(row.createdAt), units: row.units ?? 0 }));
  const closeMap: Record<string, DailyClose[]> = {};
  if (!input.pricesUnavailable) {
    for (const [symbol, rows] of closesBySymbol) closeMap[symbol] = rows;
  }
  return {
    value,
    invested,
    moneyAdded: contributions,
    withdrawals,
    cash: input.cash,
    gain,
    gainPct: contributions > 0 ? (gain / contributions) * 100 : null,
    longReturnPct,
    niftyReturnPct: shadow.returnPct,
    vsNiftyPp,
    niftyAdjustments: shadow.adjustments,
    priceCaption: pricesAsOf(holdings.map((row) => ({ symbol: row.symbol, price: resolved.get(row.symbol)! }))),
    pricesAtCost: prices.every((price) => price.atCost),
    chartNote: chartNeedsLiveNote(prices) ? CHART_LIVE_NOTE : null,
    holdings,
    lots: presentLots(displayLots, markBySymbol),
    chart: input.sessions.length === 0 ? [] : buildLongGameHistory({
      sessions: input.sessions,
      lots: openLots.map((lot) => ({ symbol: lot.symbol.toUpperCase(), date: lot.acquiredOn, units: lot.qtyOriginal, price: lot.price })),
      incomes,
      sales,
      flows,
      closes: closeMap,
      nifty: input.pricesUnavailable ? [] : input.nifty,
    }),
  };
}
