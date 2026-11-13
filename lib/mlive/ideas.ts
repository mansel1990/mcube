/**
 * One row per scanner idea: what the engine did, and what the price did next.
 * The page and the route both call this. It does not read the database.
 */

import { decisionSentence } from "./rules";

export type IdeaStrategy = "rs" | "ema";

export type IdeaStatus =
  | "waiting_approval"
  | "approved"
  | "working"
  | "bought"
  | "skipped"
  | "not_decided"
  | "expired";

export type IdeaVerdict =
  | "bought_won"
  | "bought_lost"
  | "skipped_dodged"
  | "skipped_missed"
  | "skipped_neutral"
  | "too_early";

export type IdeaGaps = { rs: number; ema: number };

export type IdeaQuote = "none" | "pre-open" | "live";

export type IdeaRow = {
  id: number;
  scanDate: string;
  validFor: string;
  symbol: string;
  strategy: IdeaStrategy;
  score: number;
  signalClose: number;
  initialStop: number | null;
  sector: string | null;
  raw: Record<string, unknown> | null;
  /** Delayed quote, when the caller already has one. */
  livePrice?: number | null;
};

export type IdeaDecision = {
  id: number;
  ideaId: number;
  tradeDate: string;
  outcome: string;
  reasonCode: string | null;
  sectorCount?: number | null;
  limitCount?: number | null;
  minOrderInr?: number | null;
  sizing: { qty?: number; limit?: number; stop?: number; notional?: number } | null;
  positionId: number | null;
};

export type IdeaOrder = {
  id: number;
  decisionId: number | null;
  side: "BUY" | "SELL";
  status: string;
  qty: number;
  filled: number;
  avgPrice: number | null;
};

export type IdeaPosition = {
  id: number;
  symbol: string;
  strategy: IdeaStrategy | null;
  qty: number;
  avgPrice: number;
  openedOn: string;
  closed: boolean;
  realisedPnl: number;
};

export type IdeaBar = {
  symbol: string;
  date: string;
  close: number;
  high?: number | null;
  low?: number | null;
};

export type IdeaFact = { label: string; value: string };

export type IdeaChartBar = { date: string; close: number; ema20: number | null };

export type BuiltIdea = {
  id: number;
  scanDate: string;
  validFor: string;
  symbol: string;
  strategy: IdeaStrategy;
  sector: string | null;
  score: number;
  signalClose: number;
  stop: number | null;
  /** (signal close − stop) ÷ signal close. Null when the stop is missing. */
  riskPct: number | null;
  livePrice: number | null;
  /** How far the live price sits from the stop, as a percent of the live price. */
  distanceToStopPct: number | null;
  aboveStop: boolean | null;
  /** `pre-open` means the quote is from before today's 09:15 IST open. */
  quote: IdeaQuote;
  status: IdeaStatus;
  reasonCode: string | null;
  /** Short "what we did" line. The full decision sentence stays in `sentence`. */
  action: string;
  held: boolean;
  sentence: string;
  decisionId: number | null;
  sizing: { qty: number; limit: number; notional: number; risk: number } | null;
  fillPrice: number | null;
  positionId: number | null;
  positionOpen: boolean;
  avgPrice: number | null;
  positionQty: number;
  pnl: number | null;
  facts: IdeaFact[];
  bars: IdeaChartBar[];
  signalDate: string | null;
  after5: number | null;
  after10: number | null;
  after20: number | null;
  maxUp: number | null;
  maxDown: number | null;
  verdict: IdeaVerdict | null;
};

export type IdeaSummary = {
  ideas: number;
  rs: number;
  ema: number;
  waiting: number;
  approved: number;
  working: number;
  bought: number;
  winRate: number | null;
  skipped: number;
  dodged: number;
  missed: number;
  neutral: number;
  notDecided: number;
  avgAfter10Bought: number | null;
  avgAfter10Skipped: number | null;
};

const STATUS_ORDER: IdeaStatus[] = [
  "waiting_approval",
  "approved",
  "working",
  "bought",
  "skipped",
  "not_decided",
  "expired",
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pctChange(base: number, next: number): number | null {
  if (!(base > 0) || !Number.isFinite(next)) return null;
  return round2(((next - base) / base) * 100);
}

function numOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNum(raw: Record<string, unknown> | null, keys: string[]): number | null {
  if (!raw) return null;
  for (const key of keys) {
    const n = numOf(raw[key]);
    if (n != null) return n;
  }
  return null;
}

function textOf(raw: Record<string, unknown> | null, keys: string[]): string | null {
  if (!raw) return null;
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Only the scanner fields this strategy actually stored. A missing RS is left off an EMA card. */
export function scannerFacts(raw: Record<string, unknown> | null, strategy: IdeaStrategy): IdeaFact[] {
  const facts: IdeaFact[] = [];
  const rsi = firstNum(raw, ["rsi", "RSI"]);
  const volume = firstNum(raw, ["volume_ratio", "volumeRatio", "vol_ratio"]);
  if (rsi != null) facts.push({ label: "RSI", value: rsi.toFixed(1) });
  if (volume != null) facts.push({ label: "Vol", value: `×${volume.toFixed(2)}` });
  if (strategy === "rs") {
    const relative = firstNum(raw, ["rs", "rs_vs_nifty", "relative_strength", "nifty_rs", "rs_nifty"]);
    const high = firstNum(raw, ["high_52w", "week_high", "high52", "fifty_two_week_high", "high_52"]);
    if (relative != null) facts.push({ label: "RS", value: `${relative > 0 ? "+" : ""}${relative.toFixed(1)}%` });
    if (high != null) facts.push({ label: "52w", value: `₹${high.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` });
  } else {
    const emaGap = firstNum(raw, ["ema20_dist", "dist_ema20", "ema_distance", "distance_ema20", "ema20_gap"]);
    if (emaGap != null) facts.push({ label: "EMA20", value: `${emaGap > 0 ? "+" : ""}${emaGap.toFixed(1)}%` });
  }
  const strength = textOf(raw, ["signal_strength", "signalStrength"]);
  if (strength) facts.push({ label: "Strength", value: strength });
  return facts;
}

const ACTION_STATUS: Record<Exclude<IdeaStatus, "skipped">, string> = {
  waiting_approval: "Waiting",
  approved: "Approved",
  working: "Working",
  bought: "Bought",
  not_decided: "Not decided",
  expired: "Expired",
};

/** Short chip for the history table. The long line stays in the tooltip. */
export function actionLabel(status: IdeaStatus, reasonCode: string | null, cancelled = false): string {
  if (cancelled) return "Cancelled";
  if (status !== "skipped") return ACTION_STATUS[status];
  switch (reasonCode) {
    case "pacing_day":
    case "pacing_strategy":
    case "pacing_cash":
    case "limit":
      return "Skipped · pacing";
    case "no_funds":
      return "Skipped · no cash";
    case "too_close_to_stop":
    case "entry_below_stop":
      return "Skipped · near stop";
    case "held":
      return "Skipped · already held";
    case "sector_cap":
      return "Skipped · sector full";
    default:
      return "Skipped";
  }
}

/** 09:15 IST, as a UTC timestamp. A quote from before that is yesterday's close. */
export function marketOpenMs(today: string): number {
  const [year, month, day] = today.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 3, 45, 0);
}

export function quoteState(now: Date, asOf: string | null | undefined, today: string): "live" | "pre-open" {
  const open = marketOpenMs(today);
  if (now.getTime() < open) return "pre-open";
  const at = asOf ? Date.parse(asOf) : Number.NaN;
  if (!Number.isFinite(at) || at < open) return "pre-open";
  return "live";
}

function ema20(closes: number[]): (number | null)[] {
  const period = 20;
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      seed += closes[i];
      out.push(null);
      continue;
    }
    if (prev == null) {
      prev = (seed + closes[i]) / period;
    } else {
      prev = closes[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

function barsFor(symbol: string, scanDate: string, ohlcv: IdeaBar[], today: string): IdeaChartBar[] {
  const series = ohlcv
    .filter((bar) => bar.symbol.toUpperCase() === symbol.toUpperCase() && bar.close > 0 && bar.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const unique: IdeaBar[] = [];
  for (const bar of series) {
    if (unique[unique.length - 1]?.date === bar.date) unique[unique.length - 1] = bar;
    else unique.push(bar);
  }
  const ema = ema20(unique.map((bar) => bar.close));
  const painted = unique.map((bar, index) => ({
    date: bar.date,
    close: bar.close,
    ema20: ema[index] == null ? null : round2(ema[index] as number),
  }));
  const at = painted.findIndex((bar) => bar.date >= scanDate);
  const anchor = at === -1 ? painted.length - 1 : at;
  if (anchor < 0) return [];
  const start = Math.max(0, anchor - 39);
  return painted.slice(start, start + 60);
}

function laterSessions(symbol: string, scanDate: string, ohlcv: IdeaBar[], today: string): IdeaBar[] {
  return ohlcv
    .filter((bar) => bar.symbol.toUpperCase() === symbol.toUpperCase() && bar.date > scanDate && bar.date <= today && bar.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((bar, index, list) => list.findIndex((item) => item.date === bar.date) === index);
}

function buyOrder(decisionId: number, orders: IdeaOrder[]): IdeaOrder | null {
  const rows = orders.filter((order) => order.decisionId === decisionId && order.side !== "SELL");
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (b.filled - a.filled) || (b.id - a.id))[0];
}

function statusOf(outcome: string | null, filled: number, orderStatus: string | null): IdeaStatus {
  if (!outcome) return "not_decided";
  if (outcome === "expired") return "expired";
  if (outcome === "skipped") return "skipped";
  if (outcome === "proposed") return "waiting_approval";
  if (outcome === "approved") return "approved";
  if (outcome === "sent") {
    if (filled > 0) return "bought";
    const upper = (orderStatus ?? "").toUpperCase();
    if (upper === "CANCELLED" || upper === "REJECTED") return "skipped";
    return "working";
  }
  return "not_decided";
}

/** A close under the stop, or a low at or through the GTT (stop × (1 − gap)). */
export function stopBroken(bar: IdeaBar, stop: number | null, gap: number): boolean {
  if (stop == null || !(stop > 0)) return false;
  if (bar.close < stop) return true;
  const low = bar.low ?? bar.close;
  return low <= stop * (1 - gap);
}

function skippedVerdict(signal: number, stop: number | null, sessions: IdeaBar[], gap: number): IdeaVerdict {
  if (sessions.length < 3) return "too_early";
  const window = sessions.slice(0, 10);
  let broke = false;
  let roseClean = false;
  for (const bar of window) {
    const through = stopBroken(bar, stop, gap);
    const high = bar.high ?? bar.close;
    const reached = pctChange(signal, high);
    if (!broke && reached != null && reached >= 5) roseClean = true;
    if (through && !roseClean) broke = true;
    if (roseClean) break;
  }
  const later = sessions[9] ? pctChange(signal, sessions[9].close) : null;
  if ((broke && !roseClean) || (later != null && later < -3)) return "skipped_dodged";
  if (roseClean) return "skipped_missed";
  return "skipped_neutral";
}

function rangeExtremes(signal: number, sessions: IdeaBar[]): { maxUp: number | null; maxDown: number | null } {
  const window = sessions.slice(0, 20);
  if (!window.length || !(signal > 0)) return { maxUp: null, maxDown: null };
  let high = -Infinity;
  let low = Infinity;
  for (const bar of window) {
    high = Math.max(high, bar.high ?? bar.close);
    low = Math.min(low, bar.low ?? bar.close);
  }
  return { maxUp: pctChange(signal, high), maxDown: pctChange(signal, low) };
}

function paintLive(idea: BuiltIdea, live: number | null, quote: IdeaQuote): BuiltIdea {
  const price = quote === "live" && live != null && live > 0 ? live : null;
  const distance = price != null && idea.stop != null && price > 0
    ? round2(((price - idea.stop) / price) * 100)
    : null;
  let pnl = idea.pnl;
  let verdict = idea.verdict;
  if (quote === "live" && idea.positionOpen && price != null && idea.avgPrice != null && idea.positionQty > 0) {
    pnl = round2((price - idea.avgPrice) * idea.positionQty);
    verdict = pnl > 0 ? "bought_won" : pnl < 0 ? "bought_lost" : null;
  }
  return {
    ...idea,
    quote,
    livePrice: price,
    distanceToStopPct: distance,
    aboveStop: distance == null ? null : distance >= 0,
    pnl,
    verdict,
  };
}

/** Overlay a delayed quote. A print from before 09:15 IST stays pre-open and is not called live. */
export function applyLivePrices(
  ideas: BuiltIdea[],
  prices: Record<string, number | { price?: number | null; asOf?: string | null } | null | undefined>,
  clock?: { now: Date; today: string },
): BuiltIdea[] {
  return ideas.map((idea) => {
    const raw = prices[idea.symbol];
    const price = typeof raw === "number" ? raw : raw?.price ?? null;
    const asOf = typeof raw === "number" ? null : raw?.asOf ?? null;
    if (clock && quoteState(clock.now, typeof raw === "number" ? new Date(clock.now).toISOString() : asOf, clock.today) === "pre-open") {
      return paintLive(idea, null, "pre-open");
    }
    if (price == null || !(price > 0)) return idea;
    return paintLive(idea, price, "live");
  });
}

export function summariseIdeas(ideas: BuiltIdea[]): IdeaSummary {
  const bought = ideas.filter((idea) => idea.status === "bought");
  const decided = bought.filter((idea) => idea.verdict === "bought_won" || idea.verdict === "bought_lost");
  const won = decided.filter((idea) => idea.verdict === "bought_won").length;
  const skipped = ideas.filter((idea) => idea.status === "skipped");
  const avg = (values: (number | null)[]) => {
    const nums = values.filter((value): value is number => value != null);
    if (!nums.length) return null;
    return round2(nums.reduce((sum, value) => sum + value, 0) / nums.length);
  };
  return {
    ideas: ideas.length,
    rs: ideas.filter((idea) => idea.strategy === "rs").length,
    ema: ideas.filter((idea) => idea.strategy === "ema").length,
    waiting: ideas.filter((idea) => idea.status === "waiting_approval").length,
    approved: ideas.filter((idea) => idea.status === "approved").length,
    working: ideas.filter((idea) => idea.status === "working").length,
    bought: bought.length,
    winRate: decided.length ? won / decided.length : null,
    skipped: skipped.length,
    dodged: skipped.filter((idea) => idea.verdict === "skipped_dodged").length,
    missed: skipped.filter((idea) => idea.verdict === "skipped_missed").length,
    neutral: skipped.filter((idea) => idea.verdict === "skipped_neutral").length,
    notDecided: ideas.filter((idea) => idea.status === "not_decided").length,
    avgAfter10Bought: avg(bought.map((idea) => idea.after10)),
    avgAfter10Skipped: avg(skipped.map((idea) => idea.after10)),
  };
}

export function groupIdeas(ideas: BuiltIdea[]): { status: IdeaStatus; ideas: BuiltIdea[] }[] {
  return STATUS_ORDER
    .map((status) => ({
      status,
      ideas: ideas.filter((idea) => idea.status === status).sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol)),
    }))
    .filter((group) => group.ideas.length > 0);
}

const DEFAULT_GAPS: IdeaGaps = { rs: 0.03, ema: 0.03 };

export function buildIdeas(
  rows: IdeaRow[],
  decisions: IdeaDecision[],
  orders: IdeaOrder[],
  positions: IdeaPosition[],
  ohlcv: IdeaBar[],
  today: string,
  gaps: IdeaGaps = DEFAULT_GAPS,
): BuiltIdea[] {
  const latest = new Map<number, IdeaDecision>();
  for (const decision of decisions) {
    const prev = latest.get(decision.ideaId);
    if (!prev || decision.id > prev.id) latest.set(decision.ideaId, decision);
  }

  return rows.map((row) => {
    const decision = latest.get(row.id) ?? null;
    const order = decision ? buyOrder(decision.id, orders) : null;
    const filled = order?.filled ?? 0;
    const died = order != null && filled === 0 && ["CANCELLED", "REJECTED"].includes(order.status.toUpperCase());
    const status = statusOf(decision?.outcome ?? null, filled, order?.status ?? null);
    const stop = row.initialStop != null && row.initialStop > 0 ? row.initialStop : null;
    const sessions = laterSessions(row.symbol, row.scanDate, ohlcv, today);
    const after = (n: number) => (sessions[n - 1] ? pctChange(row.signalClose, sessions[n - 1].close) : null);
    const extremes = rangeExtremes(row.signalClose, sessions);
    const gap = row.strategy === "ema" ? gaps.ema : gaps.rs;
    const qty = decision?.sizing?.qty ?? 0;
    const limit = decision?.sizing?.limit ?? 0;
    const sizedStop = decision?.sizing?.stop ?? stop ?? 0;
    const notional = decision?.sizing?.notional && decision.sizing.notional > 0 ? decision.sizing.notional : qty * limit;
    const sizing = qty > 0 && limit > 0
      ? { qty, limit, notional: round2(notional), risk: sizedStop > 0 ? round2(qty * Math.abs(limit - sizedStop)) : 0 }
      : null;
    const position = status === "bought"
      ? (decision?.positionId != null
        ? positions.find((item) => item.id === decision.positionId) ?? null
        : positions.find((item) => item.symbol.toUpperCase() === row.symbol.toUpperCase() && item.openedOn === decision?.tradeDate && (item.strategy == null || item.strategy === row.strategy))
          ?? positions.find((item) => item.symbol.toUpperCase() === row.symbol.toUpperCase() && item.openedOn === decision?.tradeDate)
          ?? null)
      : null;
    const closedPnl = position && position.closed ? position.realisedPnl : null;
    const chart = barsFor(row.symbol, row.scanDate, ohlcv, today);
    const sentence = !decision
      ? "The engine has not decided yet."
      : decision.outcome === "expired"
        ? "This idea expired before it was sent."
        : decisionSentence({
          outcome: decision.outcome,
          side: "BUY",
          reasonCode: decision.reasonCode,
          qty: sizing?.qty,
          limit: sizing?.limit,
          stop: sizedStop || null,
          notional: sizing?.notional,
          sector: row.sector,
          sectorCount: decision.sectorCount,
          limitCount: decision.limitCount,
          minOrderInr: decision.minOrderInr,
          strategy: row.strategy,
          status: order?.status ?? null,
          orderedQty: order?.qty,
          filledQty: order?.filled,
          average: order?.avgPrice,
        });
    const built: BuiltIdea = {
      id: row.id,
      scanDate: row.scanDate,
      validFor: row.validFor,
      symbol: row.symbol,
      strategy: row.strategy,
      sector: row.sector,
      score: row.score,
      signalClose: row.signalClose,
      stop,
      riskPct: stop != null && row.signalClose > 0 ? (row.signalClose - stop) / row.signalClose : null,
      livePrice: null,
      distanceToStopPct: null,
      aboveStop: null,
      quote: "none",
      status,
      reasonCode: decision?.reasonCode ?? null,
      action: actionLabel(status, decision?.reasonCode ?? null, died),
      held: decision?.reasonCode === "held" || positions.some((item) => !item.closed && item.qty > 0 && item.symbol.toUpperCase() === row.symbol.toUpperCase()),
      sentence,
      decisionId: decision?.id ?? null,
      sizing,
      fillPrice: filled > 0 && order?.avgPrice ? order.avgPrice : null,
      positionId: position?.id ?? null,
      positionOpen: position != null && !position.closed && position.qty > 0,
      avgPrice: position?.avgPrice ?? null,
      positionQty: position?.qty ?? 0,
      pnl: closedPnl,
      facts: scannerFacts(row.raw, row.strategy),
      bars: chart,
      signalDate: chart.some((bar) => bar.date === row.scanDate) ? row.scanDate : null,
      after5: after(5),
      after10: after(10),
      after20: after(20),
      maxUp: extremes.maxUp,
      maxDown: extremes.maxDown,
      verdict: status === "bought"
        ? closedPnl == null ? null : closedPnl > 0 ? "bought_won" : closedPnl < 0 ? "bought_lost" : null
        : status === "skipped"
          ? died ? "skipped_neutral" : skippedVerdict(row.signalClose, stop, sessions, Number.isFinite(gap) ? gap : 0.03)
          : null,
    };
    return row.livePrice != null && row.livePrice > 0 ? paintLive(built, row.livePrice, "live") : built;
  });
}
