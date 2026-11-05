/**
 * Pure trading rules for Mansel Live. No I/O.
 * Exit numbers are the 5 Nov 2026 backtest (PRD section 7.5):
 * RS chandelier (highest close since entry − 2.5×ATR(14), ratchet up only),
 * EMA stop is max(previous stop, EMA20), so it only moves up. A close under that stop is the sell.
 * ATR(14) is a simple average of the true range, matching the backtest.
 * GTT 3% under the stop, no 52-week tightening.
 */

export const DEFAULT_FUND = 80_000;
export const DEFAULT_RISK_PCT = 0.01;
export const DEFAULT_MAX_ORDER_PCT = 0.25;
export const DEFAULT_MIN_ORDER = 8_000;
export const DEFAULT_CASH_RESERVE = 500;
export const DEFAULT_MAX_BUYS = 4;
export const DEFAULT_MAX_SELLS = 4;
export const DEFAULT_MAX_POSITIONS = 6;
export const DEFAULT_MAX_PER_SECTOR = 2;
export const DEFAULT_BREAKER_PCT = 0.25;
export const DEFAULT_CHASE_PCT = 0.03;
export const DEFAULT_LIMIT_OFFSET = 0.005;
export const DEFAULT_TICK = 0.05;
export const GTT_LIMIT_GAP = 0.005;

export type ExitParams = {
  trend_stop_rule: "chandelier" | "close_below_ema";
  atr_period?: number;
  atr_mult?: number;
  ema_period?: number;
  tighten_after_52w?: number;
  gtt_gap_pct: number;
};

export const EXIT_RS: ExitParams = {
  trend_stop_rule: "chandelier",
  atr_period: 14,
  atr_mult: 2.5,
  tighten_after_52w: 0,
  gtt_gap_pct: 0.03,
};

export const EXIT_EMA: ExitParams = {
  trend_stop_rule: "close_below_ema",
  ema_period: 20,
  tighten_after_52w: 0,
  gtt_gap_pct: 0.03,
};

export type Side = "BUY" | "SELL";
export type Strategy = "rs" | "ema";

export type Bar = {
  date?: string;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type SizingReason = "ok" | "too_small" | "no_funds" | "too_expensive" | "bad_stop";

export type SizingInput = {
  fund: number;
  entry: number;
  stop: number;
  spendable: number;
  riskPct?: number;
  maxOrderPct?: number;
  minOrderInr?: number;
};

export type SizingResult = {
  qty: number;
  reason: SizingReason;
  riskBudget: number;
  qtyRisk: number;
  qtyCap: number;
  qtyCash: number;
  notional: number;
  text: string;
};

function floorDiv(numerator: number, denominator: number): number {
  if (!(denominator > 0) || !(numerator > 0)) return 0;
  return Math.floor(numerator / denominator + 1e-9);
}

export function roundTick(price: number, tick = DEFAULT_TICK): number {
  if (!(tick > 0)) throw new Error("tick must be positive");
  const steps = Math.round(price / tick);
  return Math.round(steps * tick * 100) / 100;
}

export function limitPrice(signalClose: number, offset = DEFAULT_LIMIT_OFFSET, tick = DEFAULT_TICK): number {
  return roundTick(signalClose * (1 + offset), tick);
}

export function inr(n: number): string {
  const rounded = Math.round(n);
  return rounded.toLocaleString("en-IN");
}

function priceText(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function sizeOrder(input: SizingInput): SizingResult {
  const riskPct = input.riskPct ?? DEFAULT_RISK_PCT;
  const maxOrderPct = input.maxOrderPct ?? DEFAULT_MAX_ORDER_PCT;
  const minOrder = input.minOrderInr ?? DEFAULT_MIN_ORDER;
  const { fund, entry, stop, spendable } = input;
  const riskBudget = riskPct * fund;
  const perShare = entry - stop;
  const capValue = maxOrderPct * fund;
  const qtyRisk = floorDiv(riskBudget, perShare);
  const qtyCap = floorDiv(capValue, entry);
  const qtyCash = floorDiv(Math.max(0, spendable), entry);
  const rawQty = Math.min(qtyRisk, qtyCap, qtyCash);
  const notional = rawQty * entry;

  let reason: SizingReason = "ok";
  if (!(entry > 0) || !(perShare > 0)) reason = "bad_stop";
  else if (entry > capValue + 1e-6) reason = "too_expensive";
  else if (rawQty < 1 || notional + 1e-6 < minOrder) {
    const cashIsBinding = qtyCash <= qtyRisk && qtyCash <= qtyCap;
    reason = cashIsBinding ? "no_funds" : "too_small";
  }

  const qty = reason === "ok" ? rawQty : 0;
  const shownRisk = Math.round(riskBudget);
  const text =
    `risk ₹${inr(shownRisk)} ÷ (${priceText(entry)}−${priceText(stop)}) = ${qtyRisk}` +
    ` · cap ${qtyCap} · cash ${qtyCash} → ${reason === "ok" ? qty : reason}`;

  return {
    qty,
    reason,
    riskBudget,
    qtyRisk,
    qtyCap,
    qtyCash,
    notional: reason === "ok" ? notional : 0,
    text,
  };
}

export function systemCash(fund: number, openCost: number, pendingBuyValue: number): number {
  return fund - openCost - pendingBuyValue;
}

export function spendableCash(system: number, kite: number, reserve = DEFAULT_CASH_RESERVE): number {
  return Math.min(system, kite) - reserve;
}

/** Positive when Kite cash is short of the system's own cash. */
export function kiteCashGap(system: number, kite: number): number {
  return Math.max(0, system - kite);
}

export function isExcluded(symbol: string, exclude: readonly string[], isEtf: boolean): boolean {
  const upper = symbol.trim().toUpperCase();
  if (isEtf) return true;
  return exclude.some((s) => s.trim().toUpperCase() === upper);
}

/** Sanjay holds shares the system did not buy. */
export function heldOutsideSystem(kiteQty: number, systemQty: number): boolean {
  return kiteQty > systemQty;
}

export type ReconcileResult = "ok" | "missing" | "extra_ignored";

export function reconcile(systemQty: number, kiteQty: number): ReconcileResult {
  if (kiteQty < systemQty) return "missing";
  if (kiteQty > systemQty) return "extra_ignored";
  return "ok";
}

export function clampSellQty(requested: number, systemQty: number): number {
  if (requested < 1 || systemQty < 1) return 0;
  return Math.min(requested, systemQty);
}

/** A sent order uses one slot whether it fills, partially fills, or is cancelled. GTT exits do not. */
export function usesDailySlot(isGttExit: boolean): boolean {
  return !isGttExit;
}

export function slotAvailable(sent: number, maximum: number, isGttExit: boolean): boolean {
  if (isGttExit) return true;
  return sent < maximum;
}

export function isChasing(live: number, signalClose: number, chasePct = DEFAULT_CHASE_PCT): boolean {
  if (!(signalClose > 0)) return true;
  return live > signalClose * (1 + chasePct) + 1e-9;
}

export function breakerTripped(systemValue: number, peak: number, pct = DEFAULT_BREAKER_PCT): boolean {
  if (!(peak > 0)) return false;
  return systemValue <= (1 - pct) * peak + 1e-6;
}

/** A deposit raises the peak by the same amount. A withdrawal (negative) lowers it. */
export function adjustPeak(peak: number, cashflow: number): number {
  return Math.round((peak + cashflow) * 100) / 100;
}

export type CashState = {
  peak: number;
  value: number;
  status: "active" | "paused_by_user" | "paused_by_breaker" | "halted_today";
};

/**
 * Deposit or withdrawal moves peak and value by the same amount.
 * A breaker pause stays until Sanjay resumes, even if the new ratio is back inside the line.
 */
export function applyCashflow(state: CashState, cashflow: number, pct = DEFAULT_BREAKER_PCT): CashState & { tripped: boolean } {
  const peak = adjustPeak(state.peak, cashflow);
  const value = Math.round((state.value + cashflow) * 100) / 100;
  const tripped = breakerTripped(value, peak, pct);
  let status = state.status;
  if (status !== "paused_by_breaker" && tripped) status = "paused_by_breaker";
  return { peak, value, status, tripped };
}

export type HaltInput = {
  stateReadable: boolean;
  ledgerReadable: boolean;
  /** False only when a previous session exists and its end-of-day row is missing. */
  eodPresent: boolean;
  kiteSession: boolean;
  holdingsReadable: boolean;
  marginsReadable: boolean;
  bhavcopyPresent: boolean;
  unknownReject: boolean;
};

export function haltReasons(input: HaltInput): string[] {
  const reasons: string[] = [];
  if (!input.stateReadable || !input.ledgerReadable) reasons.push("ledger_failed");
  if (!input.eodPresent) reasons.push("eod_missing");
  if (!input.kiteSession) reasons.push("no_kite_session");
  if (!input.holdingsReadable || !input.marginsReadable) reasons.push("kite_unreadable");
  if (!input.bhavcopyPresent) reasons.push("bhavcopy_missing");
  if (input.unknownReject) reasons.push("order_rejected");
  return reasons;
}

export function sessionIsHalted(input: HaltInput): boolean {
  return haltReasons(input).length > 0;
}

export type PriceCheck = {
  yahooPrevClose: number | null;
  bhavClose: number | null;
  live: number | null;
  lastClose: number | null;
  volume: number | null;
  corporateAction: boolean;
};

/** Symbol-level skip. A mismatch here does not halt the rest of the book. */
export function priceSkip(check: PriceCheck): string | null {
  const { yahooPrevClose, bhavClose, live, lastClose, volume, corporateAction } = check;
  if (yahooPrevClose != null && bhavClose != null && bhavClose > 0) {
    if (Math.abs(yahooPrevClose - bhavClose) / bhavClose > 0.02 + 1e-12) return "yahoo_mismatch";
  }
  if (live != null && lastClose != null && lastClose > 0 && !corporateAction) {
    if (Math.abs(live - lastClose) / lastClose > 0.2 + 1e-12) return "price_jump";
  }
  if (volume === 0) return "zero_volume";
  return null;
}

export type IdeaCheck = {
  heldBySystem: boolean;
  heldBySanjay: boolean;
  excluded: boolean;
  sectorCount: number;
  maxPerSector: number;
  historyDays: number;
  badData: boolean;
  chasing: boolean;
  belowMinAfterSizing: boolean;
  entryBelowStop: boolean;
};

export function ideaRejectReason(check: IdeaCheck): string | null {
  if (check.heldBySystem || check.heldBySanjay) return "held";
  if (check.excluded) return "excluded";
  if (check.sectorCount >= check.maxPerSector) return "sector_cap";
  if (check.historyDays < 20) return "short_history";
  if (check.badData) return "bad_data";
  if (check.chasing) return "chasing";
  if (check.entryBelowStop) return "entry_below_stop";
  if (check.belowMinAfterSizing) return "too_small";
  return null;
}

export type ScoredIdea = {
  symbol: string;
  strategy: Strategy;
  score: number;
};

export type RankedIdea = ScoredIdea & { norm: number };

export type LiveEdge = {
  rsTrades: number;
  emaTrades: number;
  rsPerTrade: number;
  emaPerTrade: number;
};

export function normaliseScores(ideas: readonly ScoredIdea[]): RankedIdea[] {
  const groups = new Map<Strategy, ScoredIdea[]>();
  for (const idea of ideas) {
    const list = groups.get(idea.strategy) ?? [];
    list.push(idea);
    groups.set(idea.strategy, list);
  }
  const out: RankedIdea[] = [];
  for (const group of groups.values()) {
    const scores = group.map((idea) => idea.score);
    const lo = Math.min(...scores);
    const hi = Math.max(...scores);
    for (const idea of group) {
      const norm = hi === lo ? 1 : (idea.score - lo) / (hi - lo);
      out.push({ ...idea, norm });
    }
  }
  return out;
}

export function rankIdeas(ideas: readonly ScoredIdea[], live?: LiveEdge): RankedIdea[] {
  const useLive = !!live && live.rsTrades >= 20 && live.emaTrades >= 20;
  const stratOrder = (strategy: Strategy): number => {
    if (!useLive || !live) return strategy === "rs" ? 0 : 1;
    if (live.rsPerTrade === live.emaPerTrade) return strategy === "rs" ? 0 : 1;
    const better: Strategy = live.rsPerTrade > live.emaPerTrade ? "rs" : "ema";
    return strategy === better ? 0 : 1;
  };
  return normaliseScores(ideas).sort((a, b) => b.norm - a.norm || stratOrder(a.strategy) - stratOrder(b.strategy));
}

/** Combined raw score before the within-strategy 0–1 normalisation. */
export function rawSignalScore(row: {
  signal_strength?: string | null;
  rsi?: number | null;
  volume_ratio?: number | null;
}): number {
  const strength = (row.signal_strength ?? "").toLowerCase();
  const strengthScore = strength === "strong" ? 1 : strength === "moderate" ? 0.6 : 0.3;
  const rsiScore = row.rsi == null ? 0.5 : Math.min(1, Math.max(0, row.rsi / 100));
  const volume = row.volume_ratio ?? 0;
  return volume * 0.5 + strengthScore * 0.3 + rsiScore * 0.2;
}

export function makeTag(side: Side, shortId: string): string {
  const tag = `mlive${side === "BUY" ? "B" : "S"}${shortId}`;
  if (!/^[A-Za-z0-9]+$/.test(tag) || tag.length > 20 || tag.length < 7) {
    throw new Error("order tag must be alphanumeric and at most 20 characters");
  }
  return tag;
}

export function tagMatches(tag: string, side: Side): boolean {
  const prefix = side === "BUY" ? "mliveB" : "mliveS";
  return tag.startsWith(prefix) && /^[A-Za-z0-9]+$/.test(tag) && tag.length <= 20;
}

/** Simple-average ATR: the mean of the last `period` true ranges. Needs `period + 1` bars. */
export function atr(bars: readonly Bar[], period: number): number | null {
  if (period < 1 || bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const bar = bars[i];
    trs.push(Math.max(bar.high - bar.low, Math.abs(bar.high - prev), Math.abs(bar.low - prev)));
  }
  if (trs.length < period) return null;
  const window = trs.slice(-period);
  return window.reduce((sum, n) => sum + n, 0) / period;
}

export function emaLast(closes: readonly number[], period: number): number | null {
  if (period < 1 || closes.length < period) return null;
  const k = 2 / (period + 1);
  let value = closes.slice(0, period).reduce((sum, n) => sum + n, 0) / period;
  for (let i = period; i < closes.length; i++) value = closes[i] * k + value * (1 - k);
  return value;
}

/**
 * Initial stop on the signal day.
 * RS: signal close − ATR multiple (there is no earlier "since entry" close yet).
 * EMA: the 20-day EMA. Caller skips the idea when the limit entry is below it.
 */
export function initialStop(strategy: Strategy, bars: readonly Bar[], signalClose: number, params: ExitParams): number | null {
  if (strategy === "ema" || params.trend_stop_rule === "close_below_ema") {
    return emaLast(bars.map((bar) => bar.close), params.ema_period ?? 20);
  }
  const value = atr(bars, params.atr_period ?? 14);
  if (value == null) return null;
  return signalClose - (params.atr_mult ?? 2.5) * value;
}

export function entryBelowEma(entry: number, emaStop: number): boolean {
  return entry + 1e-9 < emaStop;
}

export type StopUpdate = {
  stop: number;
  made52w: boolean;
  closeBelow: boolean;
};

/**
 * Next trend stop after a daily close.
 * Both RS and EMA only move up. EMA is max(previous stop, EMA20). The sell is a close under that stop.
 * `tighten_after_52w` is 0 in the shipped settings, so a new high does not change the multiple.
 */
export function nextTrendStop(args: {
  strategy: Strategy;
  bars: readonly Bar[];
  entryIndex: number;
  previousStop: number | null;
  params: ExitParams;
}): StopUpdate | null {
  const { bars, entryIndex, previousStop, params } = args;
  if (bars.length === 0 || entryIndex < 0 || entryIndex >= bars.length) return null;
  const last = bars[bars.length - 1];
  const priorCloses = bars.slice(Math.max(0, bars.length - 253), bars.length - 1).map((bar) => bar.close);
  const made52w = priorCloses.length >= 20 && last.close >= Math.max(...priorCloses) - 1e-9;
  const tighten = made52w ? params.tighten_after_52w ?? 0 : 0;

  if (args.strategy === "ema" || params.trend_stop_rule === "close_below_ema") {
    const ema = emaLast(bars.map((bar) => bar.close), params.ema_period ?? 20);
    if (ema == null) return null;
    const stop = previousStop == null ? ema : Math.max(previousStop, ema);
    return { stop, made52w, closeBelow: last.close < stop - 1e-9 };
  }

  const period = params.atr_period ?? 14;
  const multiple = Math.max(0.5, (params.atr_mult ?? 2.5) - tighten);
  const value = atr(bars, period);
  if (value == null) return null;
  const since = bars.slice(entryIndex);
  const highest = Math.max(...since.map((bar) => bar.close));
  const raw = highest - multiple * value;
  const stop = previousStop == null ? raw : Math.max(previousStop, raw);
  return { stop, made52w, closeBelow: last.close < stop - 1e-9 };
}

export function gttPrices(stop: number, gapPct: number, tick = DEFAULT_TICK): { trigger: number; limit: number } {
  const trigger = roundTick(stop * (1 - gapPct), tick);
  const limit = roundTick(trigger * (1 - GTT_LIMIT_GAP), tick);
  return { trigger, limit };
}

export function stripNs(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.NS$/, "");
}

/** 09:10 IST is the last preflight. A missing Kite session before that only waits. */
export const PREFLIGHT_FINAL_MINUTE = 9 * 60 + 10;

export type PreflightPlan = {
  halt: boolean;
  clearHalt: boolean;
  alert: "none" | "wait" | "halt";
  haltReason: string | null;
};

export function preflightSessionPlan(args: {
  minute: number;
  reasons: readonly string[];
  status: CashState["status"];
  haltReason: string | null;
}): PreflightPlan {
  const blocking = args.reasons.filter((reason) => reason !== "kite_unreadable" || !args.reasons.includes("no_kite_session"));
  const onlySession = blocking.length === 1 && blocking[0] === "no_kite_session";
  const beforeFinal = args.minute < PREFLIGHT_FINAL_MINUTE;
  const sessionHalt = args.status === "halted_today" && args.haltReason === "no_kite_session";
  if (blocking.length === 0) {
    return { halt: false, clearHalt: sessionHalt, alert: "none", haltReason: null };
  }
  if (onlySession && beforeFinal) {
    return { halt: false, clearHalt: sessionHalt, alert: "wait", haltReason: null };
  }
  return { halt: true, clearHalt: false, alert: "halt", haltReason: blocking.join(",") };
}

export type DayDecision = {
  ideaId: number | null;
  positionId: number | null;
  side: Side;
  outcome: string;
  symbol: string;
};

function decisionKey(row: DayDecision): string {
  return row.side === "SELL" ? `SELL:${row.positionId}` : `BUY:${row.ideaId}`;
}

/** One buy per idea and one sell per position. Approved and sent rows stay. Proposed and skipped are replaced. */
export function mergeDayDecisions(existing: readonly DayDecision[], incoming: readonly DayDecision[]): DayDecision[] {
  const map = new Map(existing.map((row) => [decisionKey(row), row]));
  for (const row of incoming) {
    const prev = map.get(decisionKey(row));
    if (prev && (prev.outcome === "approved" || prev.outcome === "sent")) continue;
    map.set(decisionKey(row), row);
  }
  return [...map.values()];
}

export function coversDecision(orderForDecision: boolean, openBuyForSymbolToday: boolean): boolean {
  return orderForDecision || openBuyForSymbolToday;
}

/** Cancel when the position is gone. Otherwise the GTT quantity must match the position. */
export function gttQtyAction(positionQty: number, gttQty: number): "cancel" | "resize" | "keep" {
  if (positionQty < 1) return "cancel";
  if (gttQty !== positionQty) return "resize";
  return "keep";
}

export type GttTriggerView = {
  status: string;
  orders?: Array<{
    result?: {
      order_result?: { order_id?: string; status?: string; rejection_reason?: string } | null;
    } | null;
  }>;
};

export function gttExitPlan(trigger: GttTriggerView):
  | { action: "ignore" }
  | { action: "problem"; reason: string }
  | { action: "track"; orderId: string } {
  if (trigger.status !== "triggered") return { action: "ignore" };
  const result = trigger.orders?.[0]?.result?.order_result;
  if (!result?.order_id) return { action: "problem", reason: "GTT triggered without an order" };
  const rejected = (result.status ?? "").toLowerCase() === "rejected" || Boolean(result.rejection_reason);
  if (rejected) return { action: "problem", reason: result.rejection_reason || "GTT order rejected" };
  return { action: "track", orderId: result.order_id };
}

/** Price of the new shares when Kite reports a cumulative average. */
export function fillDeltaPrice(prevFilled: number, prevAvg: number, newFilled: number, newAvg: number): number {
  const delta = newFilled - prevFilled;
  if (delta <= 0) return newAvg;
  return (newAvg * newFilled - prevAvg * prevFilled) / delta;
}

export function limitCrossed(side: Side, live: number, limit: number): boolean {
  if (!(live > 0) || !(limit > 0)) return false;
  return side === "BUY" ? live <= limit + 1e-9 : live + 1e-9 >= limit;
}

const KNOWN_REJECTS = [
  "insufficient funds",
  "insufficient balance",
  "circuit limit",
  "tick size",
  "quantity freeze",
  "freeze quantity",
  "holdings not available",
];

export function rejectIsKnown(message: string): boolean {
  const text = message.toLowerCase();
  return KNOWN_REJECTS.some((item) => text.includes(item));
}

/** Dry-run books include simulated rows. A live book shows only real rows. */
export function rowInBook(rowDry: boolean, dryRunSetting: unknown): boolean {
  if (dryRunSetting !== false) return true;
  return !rowDry;
}

/** A dry decision is approved the same way as a real one. */
export function canApproveDecision(args: {
  outcome: string;
  tradeDate: string;
  today: string;
  next: string;
  dryRun: boolean;
}): boolean {
  if (args.outcome !== "proposed") return false;
  return args.tradeDate === args.today || args.tradeDate === args.next;
}

/** Better Auth stores the Mongo id on `_id`. Session user ids match either field. */
export function pushUserIds(user: { id?: unknown; _id?: unknown } | null | undefined): string[] {
  if (!user) return [];
  const ids = [user.id, user._id]
    .filter((value) => value != null && String(value) !== "")
    .map((value) => String(value));
  return [...new Set(ids)];
}

/** Last price Kite needs on a GTT: live quote, then the official close, then the average. */
export function gttLastPrice(live: number | null | undefined, lastClose: number | null | undefined, avgPrice: number): number {
  if (typeof live === "number" && live > 0) return live;
  if (typeof lastClose === "number" && lastClose > 0) return lastClose;
  return avgPrice;
}
