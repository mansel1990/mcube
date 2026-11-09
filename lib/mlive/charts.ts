export type HistoryPoint = {
  date: string;
  value: number;
  peak: number;
  drawdown: number;
};

export type ChartPoint = HistoryPoint & {
  start: boolean;
  live: boolean;
};

export type StrategyPnl = {
  strategy: "rs" | "ema";
  pnl: number;
  trades: number;
  wins: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The account figure Home and the chart share.
 * value = fund − cost of open shares + their marked value.
 * A pending buy is not spent yet, so it is not taken out.
 * With no open positions the value is the fund.
 */
export function homeAccount(input: {
  fund: number;
  positions: { qty: number; avgPrice: number; live?: number | null }[];
}): number {
  let invested = 0;
  let marked = 0;
  for (const position of input.positions) {
    invested += position.qty * position.avgPrice;
    const live = position.live;
    const price = live != null && Number.isFinite(live) && live > 0 ? live : position.avgPrice;
    marked += position.qty * price;
  }
  return input.fund - invested + marked;
}

export function accountDrawdown(account: number, peak: number): number {
  if (!(peak > 0)) return 0;
  return Math.max(0, (1 - account / peak) * 100);
}

export function seriesMove(points: { value: number }[]): number {
  if (points.length < 2) return 0;
  return points[points.length - 1].value - points[0].value;
}

/**
 * History, then the first deposit in front of it, then today's live account.
 * A deposit and a live point on the same day stay as two points, so a new
 * account has a line before the first saved close.
 */
export function equitySeries(input: {
  history: HistoryPoint[];
  deposit: { date: string; amount: number } | null;
  live: { date: string; value: number; peak: number; drawdown: number } | null;
  range?: "all" | "1m";
}): ChartPoint[] {
  let points: ChartPoint[] = input.history
    .filter((point) => point.date)
    .map((point) => ({ ...point, start: false, live: false }));

  const deposit = input.deposit;
  if (deposit?.date) {
    const match = points.findIndex((point) => point.date === deposit.date && point.value === deposit.amount);
    if (match >= 0) {
      points[match] = { ...points[match], start: true };
    } else {
      const start: ChartPoint = {
        date: deposit.date,
        value: deposit.amount,
        peak: deposit.amount,
        drawdown: 0,
        start: true,
        live: false,
      };
      const at = points.findIndex((point) => point.date >= deposit.date);
      points = at === -1 ? [...points, start] : [...points.slice(0, at), start, ...points.slice(at)];
    }
  }

  const live = input.live;
  if (live?.date) {
    const livePoint: ChartPoint = {
      date: live.date,
      value: live.value,
      peak: live.peak,
      drawdown: live.drawdown,
      start: false,
      live: true,
    };
    let index = -1;
    for (let i = points.length - 1; i >= 0; i -= 1) {
      if (points[i].date === live.date && !points[i].start) index = i;
    }
    if (index >= 0) {
      points[index] = livePoint;
    } else {
      const at = points.findIndex((point) => point.date > live.date);
      points = at === -1 ? [...points, livePoint] : [...points.slice(0, at), livePoint, ...points.slice(at)];
    }
  }

  return input.range === "1m" ? points.slice(-22) : points;
}

export type TradeBook = {
  strategy: string;
  realised: number;
  closed: boolean;
  symbol: string;
  dryRun: boolean;
  openedAt: number;
  closedAt: number | null;
};

export type ChargeRow = {
  symbol: string;
  dryRun: boolean;
  amount: number;
  /** Ledger write time. A later adjustment can fall outside the trade. */
  ts: number;
  /** When the referenced order was placed. This is what attaches the charge to the trade. */
  orderAt?: number;
};

const CHARGE_SLACK_MS = 60_000;

/** Closed-trade P&L is the position's realised amount plus the signed charge rows (costs are negative). */
export function netOfCharges(realised: number, chargeAmounts: number[], closed: boolean): number {
  if (!closed) return realised;
  const net = realised + chargeAmounts.reduce((sum, amount) => sum + amount, 0);
  return Math.round(net * 100) / 100;
}

function chargeOwner(charge: ChargeRow, trades: TradeBook[]): number | null {
  let best = -1;
  let opened = -Infinity;
  trades.forEach((trade, index) => {
    if (trade.symbol !== charge.symbol || trade.dryRun !== charge.dryRun) return;
    const at = charge.orderAt ?? charge.ts;
    const end = trade.closedAt ?? Number.POSITIVE_INFINITY;
    if (at < trade.openedAt - CHARGE_SLACK_MS || at > end + CHARGE_SLACK_MS) return;
    if (trade.openedAt >= opened) {
      opened = trade.openedAt;
      best = index;
    }
  });
  return best < 0 ? null : best;
}

export function settleTrades(trades: TradeBook[], charges: ChargeRow[]): { strategy: string; pnl: number; closed: boolean }[] {
  const assigned = trades.map(() => [] as number[]);
  for (const charge of charges) {
    const index = chargeOwner(charge, trades);
    if (index != null) assigned[index].push(charge.amount);
  }
  return trades.map((trade, index) => ({
    strategy: trade.strategy,
    pnl: netOfCharges(trade.realised, assigned[index], trade.closed),
    closed: trade.closed,
  }));
}

export function strategyFromBooks(trades: TradeBook[], charges: ChargeRow[]): StrategyPnl[] {
  return strategyBoard(
    settleTrades(trades, charges).map((trade) => ({
      strategy: trade.strategy,
      pnl: trade.pnl,
      trades: trade.closed ? 1 : 0,
      wins: trade.closed && trade.pnl > 0 ? 1 : 0,
    }))
  );
}

export function strategyBoard(rows: { strategy: string; pnl: number; trades: number; wins: number }[]): StrategyPnl[] {
  return (["rs", "ema"] as const).map((strategy) => {
    const matched = rows.filter((row) => (row.strategy.trim().toLowerCase() === "ema" ? "ema" : "rs") === strategy);
    return {
      strategy,
      pnl: matched.reduce((sum, row) => sum + row.pnl, 0),
      trades: matched.reduce((sum, row) => sum + row.trades, 0),
      wins: matched.reduce((sum, row) => sum + row.wins, 0),
    };
  });
}

export function moveAlong(index: number | null, step: -1 | 1, length: number): number | null {
  if (length < 1) return null;
  const current = index == null ? (step < 0 ? length : -1) : index;
  return Math.max(0, Math.min(length - 1, current + step));
}

export function nearestIndex(points: { x: number }[], x: number): number {
  if (!points.length) return 0;
  let best = 0;
  let distance = Infinity;
  points.forEach((point, index) => {
    const gap = Math.abs(point.x - x);
    if (gap < distance) {
      distance = gap;
      best = index;
    }
  });
  return best;
}

export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month}`;
}

export type Plot = {
  points: { x: number; y: number; value: number }[];
  ticks: { value: number; y: number }[];
  dates: { index: number; x: number; label: string }[];
  y: (value: number) => number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const PAD = { top: 28, right: 16, bottom: 36, left: 76 };

function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export function rupeeTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [];
  const step = niceStep((max - min) / Math.max(count - 1, 1));
  const start = Math.ceil((min - step * 1e-8) / step) * step;
  const ticks: number[] = [];
  for (let i = 0; i < count + 2; i += 1) {
    const value = Math.round((start + i * step) * 100) / 100;
    if (value > max + step * 1e-6) break;
    if (value >= min - step * 1e-6) ticks.push(value);
  }
  return ticks;
}

function labelIndexes(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 3) return Array.from({ length: count }, (_, index) => index);
  return [0, Math.round((count - 1) / 2), count - 1];
}

export function plotChart(
  points: { date: string; value: number }[],
  width: number,
  height: number,
  domain?: { min?: number; max?: number; padLeft?: number }
): Plot {
  const left = domain?.padLeft ?? PAD.left;
  const right = width - PAD.right;
  const top = PAD.top;
  const bottom = height - PAD.bottom;
  const empty: Plot = { points: [], ticks: [], dates: [], y: () => top, left, right, top, bottom };
  if (!points.length) return empty;

  let min = domain?.min ?? Math.min(...points.map((point) => point.value));
  let max = domain?.max ?? Math.max(...points.map((point) => point.value));
  if (!(max > min)) {
    const pad = Math.max(Math.abs(min) * 0.02, 1);
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const y = (value: number) => top + ((max - value) / span) * (bottom - top);
  const x = (index: number) => (points.length === 1 ? (left + right) / 2 : left + (index / (points.length - 1)) * (right - left));
  return {
    points: points.map((point, index) => ({ x: x(index), y: y(point.value), value: point.value })),
    ticks: rupeeTicks(min, max).map((value) => ({ value, y: y(value) })),
    dates: labelIndexes(points.length).map((index) => ({ index, x: x(index), label: shortDate(points[index].date) })),
    y,
    left,
    right,
    top,
    bottom,
  };
}
