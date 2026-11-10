/**
 * One profit-and-loss model for Charts and Reports.
 * Deposits and withdrawals are capital, never profit.
 * An intraday charge adjustment lowers charges; it is not profit.
 * Dry-run rows are included only when `dryRun` is set.
 */

import { addDays, isTradingDay } from "./calendar";
import type { ChargeSplit } from "./charges";

/** Charge split plus an unclassified total when the rows have not been itemised yet. */
export type BookedCharges = ChargeSplit & { unclassified: number };

export type PnlRange = "1m" | "3m" | "all";
export type PnlStrategyFilter = "all" | "rs" | "ema";
export type ExitReason = "trend_stop" | "gtt_exit" | "gtt_fallback" | "manual" | "breaker";
export type ChargeSource = "kite" | "formula" | "adjustment";

export const EXIT_REASONS: ExitReason[] = ["trend_stop", "gtt_exit", "gtt_fallback", "manual", "breaker"];
export const CHARGE_TYPES = ["brokerage", "stt", "exchange", "sebi", "stamp", "gst", "dp"] as const;
export type ChargeType = (typeof CHARGE_TYPES)[number];

export type PnlPosition = {
  id: number;
  symbol: string;
  strategy: "rs" | "ema" | null;
  qty: number;
  avgPrice: number;
  openedAt: string;
  closedAt: string | null;
  trendStop: number | null;
  initialStop?: number | null;
  realisedPnl?: number;
  charges?: number;
  dryRun?: boolean;
  exitReason?: ExitReason | null;
  decision?: string | null;
  sizing?: string | null;
  auditIds?: number[];
};

export type PnlFill = {
  id: number;
  positionId: number;
  orderId?: number | null;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  ts: string;
  kind?: string | null;
};

export type PnlChargeItem = ChargeSplit & {
  id: number;
  positionId: number;
  orderId?: number | null;
  side: "BUY" | "SELL";
  intraday: boolean;
  source: ChargeSource;
  ts: string;
  dryRun?: boolean;
};

export type PnlLedgerRow = {
  id: number;
  kind: "deposit" | "withdrawal" | "realised_pnl" | "charges";
  amount: number;
  ts: string;
  refOrderId?: number | null;
  dryRun?: boolean;
  note?: string | null;
};

export type PnlEquity = { date: string; value: number; peak?: number };
export type PnlGtt = {
  positionId: number;
  history?: { at?: string; stop?: number; trigger?: number; limit?: number; qty?: number }[];
  triggerPrice?: number;
  status?: string;
};
export type PnlBar = { symbol: string; date: string; high: number; low: number; close: number };

export type BuildPnlInput = {
  positions: PnlPosition[];
  fills: PnlFill[];
  chargeItems: PnlChargeItem[];
  ledger: PnlLedgerRow[];
  equity: PnlEquity[];
  marks: Record<string, number | null | undefined>;
  gtts: PnlGtt[];
  ohlcv: PnlBar[];
  today: string;
  range: PnlRange;
  strategy: PnlStrategyFilter;
  dryRun?: boolean;
  /** Fraction, matching `breaker_pct`. 0.25 is a 25% breaker. */
  breakerPct?: number;
  maxPositions?: number;
  holidays?: string[];
};

export type PnlStats = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  payoff: number | null;
  profitFactor: number | null;
  expectancy: number;
  expectancyR: number | null;
  best: { id: number; symbol: string; net: number } | null;
  worst: { id: number; symbol: string; net: number } | null;
  longestWinStreak: number;
  longestLossStreak: number;
  avgDays: number;
  medianDays: number;
  avgInvestedPct: number;
  maxInvestedPct: number;
  maxOpenPositions: number;
};

export type PnlTrade = {
  id: number;
  symbol: string;
  strategy: "rs" | "ema";
  status: "open" | "closed";
  entryDate: string;
  entryAvg: number;
  exitDate: string | null;
  exitAvg: number | null;
  qty: number;
  daysHeld: number;
  intraday: boolean;
  exitReason: ExitReason | null;
  initialStop: number | null;
  currentStop: number | null;
  gross: number;
  charges: BookedCharges;
  chargeRows: PnlChargeItem[];
  /** True when an open position has an active Kite stop. Null once the trade is closed. */
  gttLive: boolean | null;
  /** Kite trigger for the open stop, when one is stored. */
  gttTrigger: number | null;
  net: number;
  netPct: number;
  r: number | null;
  boughtBelowStop: boolean;
  mfe: number | null;
  mae: number | null;
  fills: PnlFill[];
  stops: NonNullable<PnlGtt["history"]>;
  decision: string | null;
  sizing: string | null;
  auditIds: number[];
};

export type PeriodRow = {
  period: string;
  trades: number;
  wins: number;
  gross: number;
  charges: number;
  net: number;
  cumulative: number;
};

export type AccountPoint = { date: string; value: number; live?: boolean; start?: boolean; prev: number | null };
export type CumulativePoint = { date: string; gross: number; net: number; charges: number; prevNet: number | null };
export type InvestedPoint = { date: string; investedPct: number; openPositions: number };
export type HistBin = { from: number; to: number; count: number };
export type RollingPoint = { symbol: string; winRate: number; profitFactor: number | null };

export type CapitalStatement = {
  starting: number;
  deposits: number;
  withdrawals: number;
  netRealised: number;
  openCharges: number;
  tradingLimit: number;
  openCost: number;
  openProfit: number;
  marketValue: number;
  accountValue: number;
  /** Non-zero only when the ledger does not match the lines above. */
  gap: number;
};

export type PnlModel = {
  summary: {
    deposited: number;
    withdrawn: number;
    netCapital: number;
    grossRealised: number;
    charges: number;
    chargesByType: BookedCharges;
    netRealised: number;
    /** Price move on open positions, before the buy charges already paid. */
    unrealised: number;
    openCharges: number;
    /** Unrealised price move minus buy charges. */
    openNet: number;
    netTotal: number;
    returnPct: number;
    turnover: number;
    chargesPctGross: number;
    chargesPctTurnover: number;
    accountValue: number;
    peak: number;
    drawdownPct: number;
    drawdownInr: number;
    maxDrawdownPct: number;
    maxDrawdownInr: number;
    breakerPct: number;
  };
  stats: PnlStats;
  trades: PnlTrade[];
  byStrategy: {
    rs: { stats: PnlStats; net: number; gross: number; charges: number; spark: { date: string; net: number }[] };
    ema: { stats: PnlStats; net: number; gross: number; charges: number; spark: { date: string; net: number }[] };
  };
  byPeriod: { day: PeriodRow[]; week: PeriodRow[]; month: PeriodRow[] };
  series: {
    account: AccountPoint[];
    cumulative: CumulativePoint[];
    invested: InvestedPoint[];
    chargesByMonth: { period: string; charges: number; turnover: number; pct: number }[];
    rolling: RollingPoint[];
  };
  distribution: { bins: HistBin[]; mean: number | null; median: number | null } | null;
  byReason: { reason: ExitReason; count: number; net: number }[];
  capital: CapitalStatement;
  maxPositions: number;
};

function paise(n: number): number {
  return Math.round(n * 100) / 100;
}

export function istDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value.slice(0, 10);
  return dt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function emptySplit(): BookedCharges {
  return { brokerage: 0, stt: 0, exchange: 0, sebi: 0, stamp: 0, gst: 0, dp: 0, unclassified: 0, total: 0 };
}

function addSplit(into: BookedCharges, row: ChargeSplit & { unclassified?: number }): void {
  const covered = paise(row.brokerage + row.stt + row.exchange + row.sebi + row.stamp + row.gst + row.dp);
  const gap = paise(row.total - covered) || 0;
  into.brokerage = paise(into.brokerage + row.brokerage);
  into.stt = paise(into.stt + row.stt);
  into.exchange = paise(into.exchange + row.exchange);
  into.sebi = paise(into.sebi + row.sebi);
  into.stamp = paise(into.stamp + row.stamp);
  into.gst = paise(into.gst + row.gst);
  into.dp = paise(into.dp + row.dp);
  into.unclassified = paise(into.unclassified + gap);
  into.total = paise(into.total + row.total);
}

function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), day)).toISOString().slice(0, 10);
}

function rangeStart(today: string, range: PnlRange): string | null {
  if (range === "1m") return shiftMonths(today, -1);
  if (range === "3m") return shiftMonths(today, -3);
  return null;
}

export function isoWeekKey(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const year = dt.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function tradingDaysHeld(entry: string, exit: string, holidays: ReadonlySet<string>): number {
  if (exit <= entry) return 0;
  let count = 0;
  let cursor = addDays(entry, 1);
  while (cursor <= exit) {
    if (isTradingDay(cursor, holidays)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function vwap(fills: PnlFill[], side: "BUY" | "SELL"): { qty: number; avg: number; notional: number } {
  const rows = fills.filter((fill) => fill.side === side);
  const qty = rows.reduce((sum, fill) => sum + fill.qty, 0);
  const notional = rows.reduce((sum, fill) => sum + fill.qty * fill.price, 0);
  return { qty, avg: qty > 0 ? notional / qty : 0, notional };
}

function asReason(value: string | null | undefined): ExitReason | null {
  return EXIT_REASONS.includes(value as ExitReason) ? (value as ExitReason) : null;
}

function profitFactor(winSum: number, lossSum: number): number | null {
  if (lossSum > 0) return winSum / lossSum;
  if (winSum > 0) return null;
  return null;
}

function statsOf(closed: PnlTrade[], exposure: { avg: number; max: number; maxOpen: number }): PnlStats {
  const wins = closed.filter((trade) => trade.net > 0);
  const losses = closed.filter((trade) => trade.net < 0);
  const winSum = wins.reduce((sum, trade) => sum + trade.net, 0);
  const lossSum = losses.reduce((sum, trade) => sum + Math.abs(trade.net), 0);
  const avgWin = wins.length ? winSum / wins.length : 0;
  const avgLoss = losses.length ? lossSum / losses.length : 0;
  const rs = closed.map((trade) => trade.r).filter((value): value is number => value != null);
  let winStreak = 0;
  let lossStreak = 0;
  let longestWin = 0;
  let longestLoss = 0;
  for (const trade of closed) {
    if (trade.net > 0) {
      winStreak += 1;
      lossStreak = 0;
    } else {
      lossStreak += 1;
      winStreak = 0;
    }
    longestWin = Math.max(longestWin, winStreak);
    longestLoss = Math.max(longestLoss, lossStreak);
  }
  const best = closed.reduce<PnlTrade | null>((pick, trade) => (pick == null || trade.net > pick.net ? trade : pick), null);
  const worst = closed.reduce<PnlTrade | null>((pick, trade) => (pick == null || trade.net < pick.net ? trade : pick), null);
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    avgWin: paise(avgWin),
    avgLoss: paise(avgLoss),
    payoff: avgLoss > 0 ? avgWin / avgLoss : null,
    profitFactor: profitFactor(winSum, lossSum),
    expectancy: closed.length ? closed.reduce((sum, trade) => sum + trade.net, 0) / closed.length : 0,
    expectancyR: rs.length ? rs.reduce((sum, value) => sum + value, 0) / rs.length : null,
    best: best ? { id: best.id, symbol: best.symbol, net: best.net } : null,
    worst: worst ? { id: worst.id, symbol: worst.symbol, net: worst.net } : null,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    avgDays: closed.length ? closed.reduce((sum, trade) => sum + trade.daysHeld, 0) / closed.length : 0,
    medianDays: median(closed.map((trade) => trade.daysHeld)),
    avgInvestedPct: exposure.avg,
    maxInvestedPct: exposure.max,
    maxOpenPositions: exposure.maxOpen,
  };
}

function periodsOf(closed: PnlTrade[], keyOf: (date: string) => string): PeriodRow[] {
  const ordered = [...closed].sort((a, b) => (a.exitDate ?? "").localeCompare(b.exitDate ?? "") || a.id - b.id);
  const rows: PeriodRow[] = [];
  let cumulative = 0;
  for (const trade of ordered) {
    const period = keyOf(trade.exitDate ?? trade.entryDate);
    let row = rows.find((item) => item.period === period);
    if (!row) {
      row = { period, trades: 0, wins: 0, gross: 0, charges: 0, net: 0, cumulative: 0 };
      rows.push(row);
    }
    row.trades += 1;
    if (trade.net > 0) row.wins += 1;
    row.gross = paise(row.gross + trade.gross);
    row.charges = paise(row.charges + trade.charges.total);
    row.net = paise(row.net + trade.net);
    cumulative = paise(cumulative + trade.net);
    row.cumulative = cumulative;
  }
  return rows;
}

function histogram(values: number[]): { bins: HistBin[]; mean: number | null; median: number | null } {
  const bins: HistBin[] = [];
  for (let step = -4; step < 10; step += 1) {
    bins.push({ from: step / 2, to: (step + 1) / 2, count: 0 });
  }
  for (const value of values) {
    let index = bins.findIndex((bin, i) => (i === bins.length - 1 ? value >= bin.from : value >= bin.from && value < bin.to));
    if (value < -2) index = 0;
    if (value > 5) index = bins.length - 1;
    if (index >= 0) bins[index].count += 1;
  }
  return {
    bins,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    median: values.length ? median(values) : null,
  };
}

function exposureOf(trades: PnlTrade[], capital: number, today: string): { avg: number; max: number; maxOpen: number; series: InvestedPoint[] } {
  if (!trades.length || !(capital > 0)) return { avg: 0, max: 0, maxOpen: 0, series: [] };
  const start = trades.reduce((min, trade) => (trade.entryDate < min ? trade.entryDate : min), trades[0].entryDate);
  const end = trades.reduce((max, trade) => {
    const exit = trade.exitDate ?? today;
    return exit > max ? exit : max;
  }, start);
  let maxPct = 0;
  let maxOpen = 0;
  let sum = 0;
  let days = 0;
  const series: InvestedPoint[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const open = trades.filter((trade) => trade.entryDate <= date && (trade.exitDate ?? today) >= date);
    const cost = open.reduce((total, trade) => total + trade.entryAvg * trade.qty, 0);
    const investedPct = (cost / capital) * 100;
    maxPct = Math.max(maxPct, investedPct);
    maxOpen = Math.max(maxOpen, open.length);
    sum += investedPct;
    days += 1;
    series.push({ date, investedPct, openPositions: open.length });
  }
  return { avg: days ? sum / days : 0, max: maxPct, maxOpen, series };
}

function accountSeries(equity: PnlEquity[], deposit: { date: string; amount: number } | null, live: { date: string; value: number }): AccountPoint[] {
  const points: AccountPoint[] = equity
    .filter((row) => row.date)
    .map((row) => ({ date: row.date.slice(0, 10), value: row.value, prev: null }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (deposit && !points.some((point) => point.date === deposit.date && point.value === deposit.amount)) {
    points.push({ date: deposit.date, value: deposit.amount, start: true, prev: null });
  } else if (deposit) {
    const start = points.find((point) => point.date === deposit.date && point.value === deposit.amount);
    if (start) start.start = true;
  }
  const sameDay = points.findIndex((point) => point.date === live.date && !point.start);
  if (sameDay >= 0) points[sameDay] = { ...points[sameDay], value: live.value, live: true };
  else points.push({ date: live.date, value: live.value, live: true, prev: null });
  const rank = (point: AccountPoint) => (point.start ? 0 : point.live ? 2 : 1);
  points.sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b));
  for (let i = 0; i < points.length; i += 1) points[i].prev = i ? points[i - 1].value : null;
  return points;
}

function drawdownOf(series: AccountPoint[]): { peak: number; drawdownPct: number; drawdownInr: number; maxDrawdownPct: number; maxDrawdownInr: number } {
  let peak = 0;
  let maxPct = 0;
  let maxInr = 0;
  for (const point of series) {
    peak = Math.max(peak, point.value);
    const drop = peak - point.value;
    const pct = peak > 0 ? (drop / peak) * 100 : 0;
    maxInr = Math.max(maxInr, drop);
    maxPct = Math.max(maxPct, pct);
  }
  const last = series[series.length - 1];
  const currentPeak = series.reduce((max, point) => Math.max(max, point.value), 0);
  const drawdownInr = last ? Math.max(0, currentPeak - last.value) : 0;
  const drawdownPct = currentPeak > 0 ? (drawdownInr / currentPeak) * 100 : 0;
  return { peak: currentPeak, drawdownPct, drawdownInr: paise(drawdownInr), maxDrawdownPct: maxPct, maxDrawdownInr: paise(maxInr) };
}

function rollingOf(closed: PnlTrade[]): RollingPoint[] {
  if (closed.length < 10) return [];
  const points: RollingPoint[] = [];
  for (let end = 9; end < closed.length; end += 1) {
    const window = closed.slice(end - 9, end + 1);
    const wins = window.filter((trade) => trade.net > 0);
    const winSum = wins.reduce((sum, trade) => sum + trade.net, 0);
    const lossSum = window.filter((trade) => trade.net < 0).reduce((sum, trade) => sum + Math.abs(trade.net), 0);
    points.push({
      symbol: window[window.length - 1].symbol,
      winRate: wins.length / window.length,
      profitFactor: profitFactor(winSum, lossSum),
    });
  }
  return points;
}

function buildTrade(
  position: PnlPosition,
  fills: PnlFill[],
  items: PnlChargeItem[],
  gtts: PnlGtt[],
  bars: PnlBar[],
  mark: number | null,
  today: string,
  holidays: ReadonlySet<string>
): PnlTrade {
  const strategy = position.strategy === "ema" ? "ema" : "rs";
  const entryDate = istDate(position.openedAt);
  const exitDate = position.closedAt ? istDate(position.closedAt) : null;
  const status = exitDate ? "closed" : "open";
  const bought = vwap(fills, "BUY");
  const sold = vwap(fills, "SELL");
  const entryAvg = position.avgPrice > 0 ? position.avgPrice : bought.avg;
  const qty = status === "open" ? position.qty : sold.qty || bought.qty || position.qty;
  const exitAvg = sold.qty > 0 ? sold.avg : null;
  const stops = gtts.flatMap((gtt) => gtt.history ?? []);
  const initialStop = position.initialStop ?? stops.find((row) => row.stop != null)?.stop ?? null;
  const lastStop = [...stops].reverse().find((row) => row.stop != null)?.stop ?? null;
  const currentStop = status === "open" ? (position.trendStop ?? lastStop) : (lastStop ?? position.trendStop);
  const charges = emptySplit();
  if (items.length) for (const item of items) addSplit(charges, item);
  else if (position.charges) {
    charges.unclassified = paise(position.charges);
    charges.total = paise(position.charges);
  }
  const gttLive = status === "open" ? gtts.some((gtt) => gtt.status === "active" || gtt.status === "DRY") : null;
  const chosenGtt = [...gtts].reverse().find((gtt) => gtt.status === "active" || gtt.status === "DRY") ?? gtts.at(-1);
  const gttTrigger = chosenGtt?.triggerPrice != null && Number.isFinite(chosenGtt.triggerPrice) ? chosenGtt.triggerPrice : null;
  const sellCharges = items.filter((item) => item.side === "SELL").reduce((sum, item) => sum + item.total, 0);
  let gross = 0;
  if (status === "closed") {
    gross = sold.qty > 0 ? paise(sold.notional - entryAvg * sold.qty) : paise((position.realisedPnl ?? 0) + sellCharges);
  } else {
    const price = mark != null && mark > 0 ? mark : entryAvg;
    gross = paise((price - entryAvg) * qty);
  }
  const net = paise(gross - charges.total);
  const boughtBelowStop = initialStop != null && entryAvg <= initialStop;
  const risk = initialStop == null ? 0 : qty * (entryAvg - initialStop);
  const r = boughtBelowStop || !(risk > 0) ? null : net / risk;
  const heldUntil = exitDate ?? today;
  const usedBars = bars.filter((bar) => bar.symbol.toUpperCase() === position.symbol.toUpperCase() && bar.date >= entryDate && bar.date <= heldUntil);
  let mfe: number | null = null;
  let mae: number | null = null;
  if (usedBars.length && entryAvg > 0) {
    mfe = Math.max(...usedBars.map((bar) => ((bar.high - entryAvg) / entryAvg) * 100));
    mae = Math.min(...usedBars.map((bar) => ((bar.low - entryAvg) / entryAvg) * 100));
  }
  const cost = entryAvg * qty;
  const sellKind = [...fills].reverse().find((fill) => fill.side === "SELL")?.kind;
  return {
    id: position.id,
    symbol: position.symbol,
    strategy,
    status,
    entryDate,
    entryAvg,
    exitDate,
    exitAvg,
    qty,
    daysHeld: tradingDaysHeld(entryDate, heldUntil, holidays),
    intraday: exitDate != null && exitDate === entryDate,
    exitReason: status === "closed" ? (asReason(position.exitReason) ?? asReason(sellKind) ?? "trend_stop") : null,
    initialStop,
    currentStop,
    gross,
    charges,
    chargeRows: items,
    net,
    netPct: cost > 0 ? (net / cost) * 100 : 0,
    r,
    boughtBelowStop,
    gttLive,
    gttTrigger,
    mfe,
    mae,
    fills: [...fills].sort((a, b) => a.ts.localeCompare(b.ts)),
    stops,
    decision: position.decision ?? null,
    sizing: position.sizing ?? null,
    auditIds: position.auditIds ?? [],
  };
}

function inWindow(trade: PnlTrade, start: string | null, today: string): boolean {
  if (trade.status === "open") return true;
  const exit = trade.exitDate ?? trade.entryDate;
  if (exit > today) return false;
  if (start && exit < start) return false;
  return true;
}

function strategyBlock(trades: PnlTrade[], capital: number, today: string) {
  const closed = trades.filter((trade) => trade.status === "closed");
  const exposure = exposureOf(trades, capital, today);
  const stats = statsOf(closed, exposure);
  let running = 0;
  const spark = closed.map((trade) => {
    running = paise(running + trade.net);
    return { date: trade.exitDate ?? trade.entryDate, net: running };
  });
  return {
    stats,
    net: paise(closed.reduce((sum, trade) => sum + trade.net, 0)),
    gross: paise(closed.reduce((sum, trade) => sum + trade.gross, 0)),
    charges: paise(closed.reduce((sum, trade) => sum + trade.charges.total, 0)),
    spark,
  };
}

export function buildPnl(input: BuildPnlInput): PnlModel {
  const includeDry = input.dryRun === true;
  const holidays = new Set(input.holidays ?? []);
  const today = input.today;
  const positions = input.positions.filter((row) => includeDry || row.dryRun !== true);
  const ids = new Set(positions.map((row) => row.id));
  const fills = input.fills.filter((row) => ids.has(row.positionId));
  const items = input.chargeItems.filter((row) => ids.has(row.positionId) && (includeDry || row.dryRun !== true));
  const ledger = input.ledger.filter((row) => includeDry || row.dryRun !== true);
  const gtts = input.gtts.filter((row) => ids.has(row.positionId));

  const tradesAll = positions
    .map((position) =>
      buildTrade(
        position,
        fills.filter((fill) => fill.positionId === position.id),
        items.filter((item) => item.positionId === position.id),
        gtts.filter((gtt) => gtt.positionId === position.id),
        input.ohlcv,
        input.marks[position.symbol] ?? input.marks[position.symbol.toUpperCase()] ?? null,
        today,
        holidays
      )
    )
    .sort((a, b) => (a.exitDate ?? a.entryDate).localeCompare(b.exitDate ?? b.entryDate) || a.entryDate.localeCompare(b.entryDate) || a.id - b.id);

  const deposits = ledger.filter((row) => row.kind === "deposit").sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id);
  const withdrawalRows = ledger.filter((row) => row.kind === "withdrawal");
  const deposited = paise(deposits.reduce((sum, row) => sum + row.amount, 0));
  const withdrawn = paise(Math.abs(withdrawalRows.reduce((sum, row) => sum + row.amount, 0)));
  const netCapital = paise(deposited - withdrawn);
  const starting = deposits[0] ? paise(deposits[0].amount) : 0;
  const laterDeposits = paise(deposited - starting);
  const openAll = tradesAll.filter((trade) => trade.status === "open");
  const closedAll = tradesAll.filter((trade) => trade.status === "closed");
  const openCost = paise(openAll.reduce((sum, trade) => sum + trade.entryAvg * trade.qty, 0));
  const openProfit = paise(openAll.reduce((sum, trade) => sum + trade.gross, 0));
  const openCharges = paise(openAll.reduce((sum, trade) => sum + trade.charges.total, 0));
  const netRealisedAll = paise(closedAll.reduce((sum, trade) => sum + trade.net, 0));
  const tradingLimit = paise(ledger.reduce((sum, row) => sum + row.amount, 0));
  const marketValue = paise(openCost + openProfit);
  const accountValue = paise(tradingLimit - openCost + marketValue);
  const capital: CapitalStatement = {
    starting,
    deposits: laterDeposits,
    withdrawals: withdrawn,
    netRealised: netRealisedAll,
    openCharges,
    tradingLimit,
    openCost,
    openProfit,
    marketValue,
    accountValue,
    gap: paise(tradingLimit - (starting + laterDeposits - withdrawn + netRealisedAll - openCharges)),
  };

  const start = rangeStart(today, input.range);
  const ranged = tradesAll.filter((trade) => inWindow(trade, start, today));
  const shown = ranged.filter((trade) => input.strategy === "all" || trade.strategy === input.strategy);
  const closed = shown.filter((trade) => trade.status === "closed");
  const exposure = exposureOf(shown, netCapital, today);
  const stats = statsOf(closed, exposure);
  const charges = emptySplit();
  for (const trade of shown) addSplit(charges, trade.charges);
  const grossRealised = paise(closed.reduce((sum, trade) => sum + trade.gross, 0));
  const netRealised = paise(closed.reduce((sum, trade) => sum + trade.net, 0));
  const openShown = shown.filter((trade) => trade.status === "open");
  const unrealised = paise(openShown.reduce((sum, trade) => sum + trade.gross, 0));
  const openChargesShown = paise(openShown.reduce((sum, trade) => sum + trade.charges.total, 0));
  const openNet = paise(openShown.reduce((sum, trade) => sum + trade.net, 0));
  const netTotal = paise(netRealised + openNet);
  const turnover = paise(
    shown.reduce((sum, trade) => sum + trade.fills.reduce((inner, fill) => inner + fill.qty * fill.price, 0), 0)
  );

  const fullAccount = accountSeries(
    input.equity.map((row) => ({ ...row, date: istDate(row.date) })),
    deposits[0] ? { date: istDate(deposits[0].ts), amount: paise(deposits[0].amount) } : null,
    { date: today, value: accountValue }
  );
  const drop = drawdownOf(fullAccount);
  const sliced = start ? fullAccount.filter((point) => point.date >= start || point.live) : fullAccount;
  const account = sliced.map((point, index) => ({ ...point, prev: index ? sliced[index - 1].value : null }));

  let runningGross = 0;
  let runningNet = 0;
  let runningCharges = 0;
  const cumulative: CumulativePoint[] = closed.map((trade, index) => {
    runningGross = paise(runningGross + trade.gross);
    runningCharges = paise(runningCharges + trade.charges.total);
    const prevNet = index === 0 ? null : runningNet;
    runningNet = paise(runningNet + trade.net);
    return { date: trade.exitDate ?? trade.entryDate, gross: runningGross, net: runningNet, charges: runningCharges, prevNet };
  });

  const monthTurnover = new Map<string, { charges: number; turnover: number }>();
  for (const trade of closed) {
    const period = (trade.exitDate ?? trade.entryDate).slice(0, 7);
    const row = monthTurnover.get(period) ?? { charges: 0, turnover: 0 };
    row.charges = paise(row.charges + trade.charges.total);
    row.turnover = paise(row.turnover + trade.fills.reduce((sum, fill) => sum + fill.qty * fill.price, 0));
    monthTurnover.set(period, row);
  }

  const rsTrades = ranged.filter((trade) => trade.strategy === "rs");
  const emaTrades = ranged.filter((trade) => trade.strategy === "ema");

  return {
    summary: {
      deposited,
      withdrawn,
      netCapital,
      grossRealised,
      charges: charges.total,
      chargesByType: charges,
      netRealised,
      unrealised,
      openCharges: openChargesShown,
      openNet,
      netTotal,
      returnPct: netCapital > 0 ? (netTotal / netCapital) * 100 : 0,
      turnover,
      chargesPctGross: grossRealised !== 0 ? (charges.total / Math.abs(grossRealised)) * 100 : 0,
      chargesPctTurnover: turnover > 0 ? (charges.total / turnover) * 100 : 0,
      accountValue,
      peak: drop.peak,
      drawdownPct: drop.drawdownPct,
      drawdownInr: drop.drawdownInr,
      maxDrawdownPct: drop.maxDrawdownPct,
      maxDrawdownInr: drop.maxDrawdownInr,
      breakerPct: (input.breakerPct ?? 0.25) * 100,
    },
    stats,
    trades: shown,
    byStrategy: {
      rs: strategyBlock(rsTrades, netCapital, today),
      ema: strategyBlock(emaTrades, netCapital, today),
    },
    byPeriod: {
      day: periodsOf(closed, (date) => date),
      week: periodsOf(closed, isoWeekKey),
      month: periodsOf(closed, (date) => date.slice(0, 7)),
    },
    series: {
      account,
      cumulative,
      invested: exposure.series,
      chargesByMonth: [...monthTurnover.entries()].map(([period, row]) => ({
        period,
        charges: row.charges,
        turnover: row.turnover,
        pct: row.turnover > 0 ? (row.charges / row.turnover) * 100 : 0,
      })),
      rolling: rollingOf(closed),
    },
    distribution: closed.length >= 5 ? histogram(closed.map((trade) => trade.r).filter((value): value is number => value != null)) : null,
    byReason: EXIT_REASONS.map((reason) => {
      const rows = closed.filter((trade) => trade.exitReason === reason);
      return { reason, count: rows.length, net: paise(rows.reduce((sum, trade) => sum + trade.net, 0)) };
    }),
    capital,
    maxPositions: input.maxPositions ?? 6,
  };
}
