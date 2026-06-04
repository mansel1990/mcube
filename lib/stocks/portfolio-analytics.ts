/** When real trade logging began — used for P&L analytics and UI copy. */
export const PORTFOLIO_TRACKING_START = "2026-06-01";

/** Fixed label — avoids locale mismatches between SSR and browser. */
export const PORTFOLIO_TRACKING_START_LABEL = "1 Jun 2026";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export interface TradeForAnalytics {
  status: "open" | "closed";
  entryDate: string;
  exitDate: string | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  invested?: number;
  unrealizedPnl?: number | null;
  realizedPnl?: number;
  realizedPnlPct?: number;
  source?: string;
  ticker?: string;
}

export type PnlPeriod = "month" | "year" | "all";

export interface PortfolioSummary {
  totalInvestedOpen: number;
  unrealizedPnl: number;
  realizedPnl: number;
  netPnl: number;
  openCount: number;
  closedCount: number;
  wins: number;
  losses: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
}

export interface PeriodStats {
  realizedPnl: number;
  closedCount: number;
  wins: number;
  losses: number;
}

export interface MonthlyPnlRow {
  key: string;
  label: string;
  realized: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface YearlyPnlRow {
  key: string;
  label: string;
  realized: number;
  trades: number;
  wins: number;
  losses: number;
}

export type PnlViewMode = "all" | "month" | "year";

export interface CumulativePnlPoint {
  date: string;
  label: string;
  pnl: number;
  cumulative: number;
  ticker?: string;
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Deterministic INR-style grouping — safe for SSR hydration. */
export function fmtInr(n: number, decimals = 0): string {
  const negative = n < 0;
  const abs = Math.abs(n);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");

  let grouped = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    let rest = intPart.slice(0, -3);
    const parts: string[] = [last3];
    while (rest.length > 0) {
      parts.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    grouped = parts.join(",");
  }

  const body = decPart ? `${grouped}.${decPart}` : grouped;
  return negative ? `-${body}` : body;
}

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function formatMonthKey(key: string): string {
  const [y, m] = key.split("-");
  const monthIndex = Number(m) - 1;
  if (monthIndex < 0 || monthIndex > 11) return key;
  return `${MONTHS_SHORT[monthIndex]} ${y}`;
}

export function formatDisplayDate(iso: string): string {
  const d = dateKey(iso);
  const [y, m, day] = d.split("-");
  const monthIndex = Number(m) - 1;
  if (monthIndex < 0 || monthIndex > 11) return d;
  return `${Number(day)} ${MONTHS_SHORT[monthIndex]} ${y}`;
}

export function formatDayMonth(iso: string): string {
  const d = dateKey(iso);
  const [, m, day] = d.split("-");
  const monthIndex = Number(m) - 1;
  if (monthIndex < 0 || monthIndex > 11) return d.slice(8, 10);
  return `${Number(day)} ${MONTHS_SHORT[monthIndex]}`;
}

export function daysSinceTrackingStart(start = PORTFOLIO_TRACKING_START): number {
  const startMs = new Date(`${start}T00:00:00+05:30`).getTime();
  const todayMs = new Date(`${todayIST()}T00:00:00+05:30`).getTime();
  return Math.max(0, Math.floor((todayMs - startMs) / 86_400_000) + 1);
}

export function isOnOrAfter(isoDate: string, start: string): boolean {
  return dateKey(isoDate) >= start;
}

/** Trades that belong to the tracking window (entry or exit on/after start). */
export function filterTradesForTracking(
  trades: TradeForAnalytics[],
  start = PORTFOLIO_TRACKING_START
): TradeForAnalytics[] {
  return trades.filter((t) => {
    if (t.status === "closed" && t.exitDate) {
      return isOnOrAfter(t.exitDate, start) || isOnOrAfter(t.entryDate, start);
    }
    return isOnOrAfter(t.entryDate, start);
  });
}

export function closedTrades(trades: TradeForAnalytics[]): TradeForAnalytics[] {
  return trades.filter((t) => t.status === "closed" && t.exitDate);
}

export function openTrades(trades: TradeForAnalytics[]): TradeForAnalytics[] {
  return trades.filter((t) => t.status === "open");
}

export function tradeRealizedPnl(trade: TradeForAnalytics): number {
  if (trade.realizedPnl != null) return trade.realizedPnl;
  if (trade.exitPrice == null) return 0;
  return (trade.exitPrice - trade.entryPrice) * trade.quantity;
}

function realizedPnlOf(trade: TradeForAnalytics): number {
  return tradeRealizedPnl(trade);
}

export interface RecentClosedItem {
  ticker: string;
  pnl: number;
  exitDate: string;
}

/** Latest closed trades for a compact W/L strip (newest exit first). */
export function listRecentClosedTrades(
  trades: TradeForAnalytics[],
  limit = 8,
  viewMode: PnlViewMode = "all",
  periodKey?: string
): RecentClosedItem[] {
  let closed = closedTrades(trades);
  if (viewMode === "month" && periodKey) {
    closed = closed.filter((t) => t.exitDate && monthKey(t.exitDate) === periodKey);
  } else if (viewMode === "year" && periodKey) {
    closed = closed.filter((t) => t.exitDate && dateKey(t.exitDate).slice(0, 4) === periodKey);
  }
  return closed
    .sort((a, b) => (b.exitDate ?? "").localeCompare(a.exitDate ?? ""))
    .slice(0, limit)
    .map((t) => ({
      ticker: (t.ticker ?? "—").toUpperCase(),
      pnl: tradeRealizedPnl(t),
      exitDate: t.exitDate!,
    }));
}

export function computePortfolioSummary(trades: TradeForAnalytics[]): PortfolioSummary {
  const open = openTrades(trades);
  const closed = closedTrades(trades);

  const totalInvestedOpen = open.reduce((s, t) => s + (t.invested ?? t.entryPrice * t.quantity), 0);
  const unrealizedPnl = open.reduce((s, t) => s + (t.unrealizedPnl ?? 0), 0);
  const realizedValues = closed.map(realizedPnlOf);
  const realizedPnl = realizedValues.reduce((s, v) => s + v, 0);
  const wins = realizedValues.filter((v) => v > 0).length;
  const losses = realizedValues.filter((v) => v < 0).length;
  const closedCount = closed.length;

  return {
    totalInvestedOpen,
    unrealizedPnl,
    realizedPnl,
    netPnl: realizedPnl + unrealizedPnl,
    openCount: open.length,
    closedCount,
    wins,
    losses,
    winRate: closedCount ? Math.round((wins / closedCount) * 100) : 0,
    bestTrade: closedCount ? Math.max(...realizedValues) : 0,
    worstTrade: closedCount ? Math.min(...realizedValues) : 0,
  };
}

function tradeInPeriod(trade: TradeForAnalytics, period: PnlPeriod, ref = todayIST()): boolean {
  if (!trade.exitDate) return false;
  const exit = dateKey(trade.exitDate);
  if (period === "all") return true;
  if (period === "month") return monthKey(exit) === ref.slice(0, 7);
  return exit.slice(0, 4) === ref.slice(0, 4);
}

function statsFromClosed(closed: TradeForAnalytics[]): PeriodStats {
  const values = closed.map(realizedPnlOf);
  return {
    realizedPnl: values.reduce((s, v) => s + v, 0),
    closedCount: closed.length,
    wins: values.filter((v) => v > 0).length,
    losses: values.filter((v) => v < 0).length,
  };
}

export function getPeriodStats(trades: TradeForAnalytics[], period: PnlPeriod): PeriodStats {
  const closed = closedTrades(trades).filter((t) => tradeInPeriod(t, period));
  return statsFromClosed(closed);
}

export function getRealizedStatsForMonth(trades: TradeForAnalytics[], monthKeyValue: string): PeriodStats {
  const closed = closedTrades(trades).filter((t) => t.exitDate && monthKey(t.exitDate) === monthKeyValue);
  return statsFromClosed(closed);
}

export function getRealizedStatsForYear(trades: TradeForAnalytics[], year: string): PeriodStats {
  const closed = closedTrades(trades).filter((t) => t.exitDate && dateKey(t.exitDate).slice(0, 4) === year);
  return statsFromClosed(closed);
}

export function listAvailableMonthKeys(trades: TradeForAnalytics[], includeToday = true): string[] {
  const keys = new Set<string>();
  for (const t of closedTrades(trades)) {
    if (t.exitDate) keys.add(monthKey(t.exitDate));
  }
  if (includeToday) keys.add(monthKey(todayIST()));
  return [...keys].sort();
}

export function listAvailableYears(trades: TradeForAnalytics[], includeToday = true): string[] {
  const keys = new Set<string>();
  for (const t of closedTrades(trades)) {
    if (t.exitDate) keys.add(dateKey(t.exitDate).slice(0, 4));
  }
  keys.add(PORTFOLIO_TRACKING_START.slice(0, 4));
  if (includeToday) keys.add(todayIST().slice(0, 4));
  return [...keys].sort();
}

export function groupRealizedPnlByMonth(trades: TradeForAnalytics[]): MonthlyPnlRow[] {
  const map = new Map<string, MonthlyPnlRow>();

  for (const t of closedTrades(trades)) {
    if (!t.exitDate) continue;
    const key = monthKey(t.exitDate);
    const pnl = realizedPnlOf(t);
    const row = map.get(key) ?? {
      key,
      label: formatMonthKey(key),
      realized: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    };
    row.realized += pnl;
    row.trades += 1;
    if (pnl > 0) row.wins += 1;
    else if (pnl < 0) row.losses += 1;
    map.set(key, row);
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function groupRealizedPnlByYear(trades: TradeForAnalytics[]): YearlyPnlRow[] {
  const map = new Map<string, YearlyPnlRow>();

  for (const t of closedTrades(trades)) {
    if (!t.exitDate) continue;
    const key = dateKey(t.exitDate).slice(0, 4);
    const pnl = realizedPnlOf(t);
    const row = map.get(key) ?? {
      key,
      label: key,
      realized: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    };
    row.realized += pnl;
    row.trades += 1;
    if (pnl > 0) row.wins += 1;
    else if (pnl < 0) row.losses += 1;
    map.set(key, row);
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function buildCumulativePnlSeries(trades: TradeForAnalytics[]): CumulativePnlPoint[] {
  const sorted = [...closedTrades(trades)].sort((a, b) =>
    dateKey(a.exitDate!).localeCompare(dateKey(b.exitDate!))
  );
  let cumulative = 0;
  return sorted.map((t) => {
    const pnl = realizedPnlOf(t);
    cumulative += pnl;
    return {
      date: dateKey(t.exitDate!),
      label: formatDayMonth(t.exitDate!),
      pnl: Math.round(pnl),
      cumulative: Math.round(cumulative),
      ticker: t.ticker,
    };
  });
}
