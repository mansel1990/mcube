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

/** Round a price down to the exchange tick. A missing or unusable tick sends nothing. */
export function floorToTick(price: number, tick: number): number | null {
  if (!(price > 0) || !(tick > 0) || !Number.isFinite(price) || !Number.isFinite(tick)) return null;
  const tickPaise = Math.round(tick * 100);
  const pricePaise = Math.round(price * 100);
  if (tickPaise < 1 || pricePaise < 1) return null;
  const floored = Math.floor(pricePaise / tickPaise) * tickPaise;
  return floored >= tickPaise ? floored / 100 : null;
}

/** Kite rejects with `{ message, error_type }`, not an Error. Alerts need that message. */
export function kiteErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; data?: unknown };
    const message = typeof record.message === "string" ? record.message.trim() : "";
    const detail = typeof record.data === "string" ? record.data.trim() : "";
    if (message && detail && !message.includes(detail)) return `${message} ${detail}`;
    if (message) return message;
    if (detail) return detail;
  }
  return "Kite did not say why the order failed.";
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

/** What a new buy may spend right now. Never negative. */
export function engineSpendable(tradingLimit: number, invested: number, pendingBuys: number, kiteCash: number, reserve: number): number {
  const room = tradingLimit - invested - pendingBuys;
  return Math.max(0, Math.min(room, kiteCash) - reserve);
}

/** Positive when Kite cash is short of the system's own cash. */
export function kiteCashGap(system: number, kite: number): number {
  return Math.max(0, system - kite);
}

function finiteCash(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Cash Kite can use for a new equity order. The live balance is the current figure. */
export function kiteAvailableCash(margins: unknown): number | null {
  if (!margins || typeof margins !== "object") return null;
  const record = margins as {
    available?: { live_balance?: unknown; cash?: unknown };
    equity?: { available?: { live_balance?: unknown; cash?: unknown } };
  };
  const available = record.available ?? record.equity?.available;
  if (!available) return null;
  const live = finiteCash(available.live_balance);
  if (live != null) return live;
  return finiteCash(available.cash);
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

/** Live price is on the stop, under it, or no more than 1% above it. */
export function buyTooCloseToStop(live: number, stop: number): boolean {
  if (!(live > 0) || !(stop > 0) || !Number.isFinite(live) || !Number.isFinite(stop)) return false;
  return live <= stop * 1.01 + 1e-6;
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

/** What Home should say about a holding. There is no fixed profit target. */
export function holdingExit(args: {
  stop: number;
  last: number | null;
  high52: number;
  gttGap?: number;
}): { sellWhen: string; hardStop: string; target: string; underStop: boolean } {
  if (!(args.stop > 0)) {
    return {
      sellWhen: "No trend stop yet.",
      hardStop: "",
      target: "No fixed target.",
      underStop: false,
    };
  }
  const underStop = args.last != null && args.last < args.stop - 1e-9;
  const stop = px(args.stop);
  const hard = gttPrices(args.stop, args.gttGap ?? 0.03);
  const high = args.high52 > 0 ? ` The 52-week high is ${px(args.high52)}, and that is not a sell price.` : "";
  return {
    underStop,
    sellWhen: underStop
      ? `Price is under ${stop}. A close here sells it the next morning.`
      : `Sell if the daily close finishes below ${stop}. The order goes out the next morning.`,
    hardStop: `Kite sells during the day if price hits ${px(hard.trigger)}.`,
    target: `No fixed target. It stays while the close holds above the stop.${high}`,
  };
}

export function gttPrices(stop: number, gapPct: number, tick = DEFAULT_TICK): { trigger: number; limit: number } {
  const trigger = floorToTick(stop * (1 - gapPct), tick);
  const limit = trigger == null ? null : floorToTick(trigger * (1 - GTT_LIMIT_GAP), tick);
  if (trigger == null || limit == null) throw new Error("tick must be positive");
  return { trigger, limit };
}

export function stripNs(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.NS$/, "");
}

/** 09:10 IST is the last preflight. A missing Kite session waits. It does not stop the day. */
export const PREFLIGHT_FINAL_MINUTE = 9 * 60 + 10;

export const KITE_LOGIN_WAIT = "Log in to Kite. Buys wait until you do.";

/** A login clears today's stop only when that stop is the missing Kite session, and only on a trading day. */
export function autoResumeOnLogin(args: {
  status: string;
  haltReason: string | null;
  tradingDay: boolean;
}): boolean {
  return args.tradingDay && args.status === "halted_today" && args.haltReason === "no_kite_session";
}

export function loginResumeCopy(clock: string): { audit: string; alert: string } {
  return {
    audit: `Kite login at ${clock} cleared today's no-login stop`,
    alert: `Kite connected at ${clock}. Trading resumed.`,
  };
}

const HALT_WORDS: Record<string, string> = {
  no_kite_session: "No Kite login.",
  order_rejected: "An order was rejected.",
  breaker: "The breaker tripped.",
  ledger_failed: "The ledger could not be read.",
  eod_missing: "Yesterday's end-of-day row is missing.",
  kite_unreadable: "Kite holdings or cash could not be read.",
  bhavcopy_missing: "The price file is missing.",
  holdings_mismatch: "Holdings do not match.",
};

/** Settings shows this next to Resume. Unknown codes stay visible. */
export function haltReasonText(reason: string | null): string {
  if (!reason) return "Stopped for today.";
  return reason.split(",").map((part) => HALT_WORDS[part.trim()] ?? part.trim()).filter(Boolean).join(" ");
}

/** Home header. A missing login is a wait, not a halt. A late login that cleared the stop says when. */
export function homeStatusPill(args: {
  status: string;
  haltReason: string | null;
  kiteConnected: boolean;
  resumedAt: string | null;
}): { label: string; connect: boolean } {
  const realHalt = args.status === "halted_today" && args.haltReason !== "no_kite_session";
  if (!args.kiteConnected && !realHalt) return { label: "Waiting for Kite login", connect: true };
  if (args.kiteConnected && args.resumedAt) return { label: `Resumed at ${args.resumedAt} after Kite login`, connect: false };
  const labels: Record<string, string> = {
    active: "Engine active",
    paused_by_user: "Paused",
    paused_by_breaker: "Breaker paused",
    halted_today: "Halted today",
  };
  return { label: labels[args.status] ?? args.status, connect: false };
}

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
  const sessionHalt = args.status === "halted_today" && args.haltReason === "no_kite_session";
  if (blocking.length === 0) {
    return { halt: false, clearHalt: sessionHalt, alert: "none", haltReason: null };
  }
  if (onlySession) {
    return { halt: false, clearHalt: false, alert: "wait", haltReason: null };
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

export function kiteCashMessage(args: { dryRun: boolean; system: number; kite: number }): string {
  const cash = Math.round(args.kite).toLocaleString("en-IN");
  if (!(args.kite > 0)) return `Cash in Kite is ₹${cash}, so no buys today.`;
  if (args.kite + 1e-6 < args.system) return "Cash in Kite is below the trading limit, so buys are smaller.";
  if (args.dryRun) return "Dry run is on. Buys stay simulated.";
  return "";
}

export type DecisionSentenceInput = {
  outcome: string;
  side?: string | null;
  reasonCode?: string | null;
  qty?: number | null;
  limit?: number | null;
  stop?: number | null;
  notional?: number | null;
  sector?: string | null;
  sectorCount?: number | null;
  minOrderInr?: number | null;
  limitCount?: number | null;
  strategy?: "rs" | "ema" | null;
  /** Exchange status when this sentence is about an order, not a decision. */
  status?: string | null;
  orderedQty?: number | null;
  filledQty?: number | null;
  average?: number | null;
};

export type OrderProgress = {
  side?: string | null;
  status?: string | null;
  ordered: number;
  filled: number;
  limit: number;
  average?: number | null;
  reasonCode?: string | null;
};

function orderStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toUpperCase();
}

/** A position is shown under What we hold only after at least one share has filled. */
export function showsHolding(filledQty: number): boolean {
  return filledQty > 0;
}

export type ActivityFace = { tone: "buy" | "sell" | "cancel"; label: "Bought" | "Sold" | "Cancelled" | "Rejected" };

/** A buy or sell that never filled is not a buy or a sell. A partial fill still is. */
export function activityFace(row: { side: string; outcome: string; detail: string }): ActivityFace {
  const sell = row.side.toUpperCase() === "SELL";
  const dead = row.outcome === "cancelled" || row.outcome === "rejected";
  const keptSome = /^(Bought|Sold|Stop sold)\b/.test(row.detail);
  if (dead && !keptSome) {
    return { tone: "cancel", label: row.outcome === "rejected" ? "Rejected" : "Cancelled" };
  }
  return sell ? { tone: "sell", label: "Sold" } : { tone: "buy", label: "Bought" };
}

/** Home label. Open and partly filled orders stay “working” until they finish or die. */
export function orderLabel(status: string | null | undefined, ordered: number, filled: number): "working" | "filled" | "cancelled" | "rejected" {
  const upper = orderStatus(status);
  if (upper === "REJECTED") return "rejected";
  if (upper === "CANCELLED") return "cancelled";
  if (upper === "COMPLETE" || (ordered > 0 && filled >= ordered)) return "filled";
  return "working";
}

/** One sentence for a live order. Filled wording uses the average fill, not the limit. */
export function orderSentence(order: OrderProgress): string {
  const side = (order.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const verb = side === "SELL" ? "sell" : "buy";
  const done = side === "SELL" ? "Sold" : "Bought";
  const status = orderStatus(order.status);
  const ordered = Math.max(0, Math.floor(order.ordered));
  const filled = Math.max(0, Math.floor(order.filled));
  const limit = order.limit ?? 0;
  const average = order.average != null && order.average > 0 ? order.average : limit;
  const label = orderLabel(status, ordered, filled);
  if (order.reasonCode === "gtt_exit" && label === "filled" && filled > 0 && average > 0) {
    return `Stop sold ${filled} at ${px(average)}.`;
  }
  if (label === "cancelled" || label === "rejected") {
    if (filled > 0 && ordered > filled) {
      const rest = ordered - filled;
      const end = label === "rejected" ? "rejected" : "cancelled";
      return `${done} ${filled} of ${ordered}. The other ${rest} ${rest === 1 ? "was" : "were"} ${end}.`;
    }
    if (filled > 0 && average > 0) return `${done} ${filled} at ${px(average)}.`;
    return label === "rejected" ? (side === "SELL" ? "Sell rejected." : "Buy rejected.") : side === "SELL" ? "Sell cancelled." : "Buy cancelled.";
  }
  if (label === "working" && filled > 0 && ordered > filled) {
    return `${done} ${filled} of ${ordered} … ${ordered - filled} still waiting.`;
  }
  if (label === "filled" && filled > 0 && average > 0) return `${done} ${filled} at ${px(average)}.`;
  if (ordered > 0 && limit > 0) return `Order placed: ${verb} ${ordered} at ${px(limit)}. Waiting to fill.`;
  return "Order placed. Waiting to fill.";
}

/** Ledger counts a buy or sell only after a fill. A sent order with no fill stays working. */
export function ledgerOutcome(
  decisionOutcome: string,
  order?: { status?: string | null; ordered?: number | null; filled?: number | null } | null
): string {
  if (!order?.status) return decisionOutcome === "sent" ? "working" : decisionOutcome;
  const filled = order.filled ?? 0;
  const label = orderLabel(order.status, order.ordered ?? 0, filled);
  if (filled > 0 || label === "filled") return "filled";
  if (label === "working") return "working";
  return label;
}

function strategyName(strategy: "rs" | "ema" | null | undefined): string {
  return strategy === "ema" ? "EMA" : strategy === "rs" ? "RS" : "strategy";
}

function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function px(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Plain line for Home and the ledger. The sizing formula stays in the audit. */
export function decisionSentence(decision: DecisionSentenceInput): string {
  const qty = decision.qty ?? 0;
  const limit = decision.limit ?? 0;
  const stop = decision.stop ?? 0;
  const side = (decision.side ?? "BUY").toUpperCase();
  const bought = side === "SELL" ? "Sold" : "Bought";
  if (decision.status != null || decision.filledQty != null || decision.orderedQty != null) {
    return orderSentence({
      side,
      status: decision.status,
      ordered: decision.orderedQty ?? qty,
      filled: decision.filledQty ?? (decision.outcome === "filled" ? qty : 0),
      limit,
      average: decision.average,
      reasonCode: decision.reasonCode,
    });
  }
  if (decision.reasonCode === "gtt_exit" && decision.outcome === "filled") {
    return qty > 0 && limit > 0 ? `Stop sold ${qty} at ${px(limit)}.` : "Stop order working.";
  }
  if (decision.outcome === "filled") {
    return qty > 0 && limit > 0 ? `${bought} ${qty} at ${px(limit)}.` : `${bought}.`;
  }
  if (decision.outcome === "sent" || decision.outcome === "working") {
    const verb = side === "SELL" ? "sell" : "buy";
    return qty > 0 && limit > 0 ? `Order placed: ${verb} ${qty} at ${px(limit)}. Waiting to fill.` : "Order placed. Waiting to fill.";
  }
  if (decision.outcome === "cancelled") return side === "SELL" ? "Sell cancelled." : "Buy cancelled.";
  if (decision.outcome === "rejected") return side === "SELL" ? "Sell rejected." : "Buy rejected.";
  if (decision.outcome === "proposed" || decision.outcome === "approved") {
    const total = decision.notional && decision.notional > 0 ? decision.notional : qty * limit;
    if (qty > 0 && limit > 0 && stop > 0) return `Ready: ${qty} shares at ${px(limit)}, total ${px(total)}, stop ${px(stop)}.`;
    if (qty > 0 && limit > 0) return `Ready: ${qty} shares at ${px(limit)}, total ${px(total)}.`;
    return "Ready.";
  }
  switch (decision.reasonCode) {
    case "no_funds": {
      const notional = decision.notional ?? (qty > 0 && limit > 0 ? qty * limit : 0);
      return qty > 0 && notional > 0
        ? `Not bought: no cash in Kite. Would be ${qty} shares ≈ ${rupees(notional)}.`
        : "Not bought: no cash in Kite.";
    }
    case "too_small":
      return `Not bought: under the ${rupees(decision.minOrderInr ?? DEFAULT_MIN_ORDER)} minimum.`;
    case "too_expensive":
      return "Not bought: one share is over the order cap.";
    case "sector_cap":
      return `Not bought: already ${decision.sectorCount ?? 2} stocks in ${decision.sector ?? "that sector"}.`;
    case "held":
      return "Not bought: already held.";
    case "excluded":
      return "Not bought: on the exclude list.";
    case "chasing":
      return "Not bought: the price has run too far above the signal.";
    case "entry_below_stop":
      return "Not bought: the entry is below the stop.";
    case "too_close_to_stop":
      return "Not bought: the live price is at or within 1% of the stop.";
    case "tick_unknown":
      return "Not sent: Kite did not give a tick size for this stock.";
    case "bad_data":
      return "Not bought: the price data is not usable.";
    case "limit":
      return "Not bought: the daily buy limit is already full.";
    case "pacing_day":
      return `Not bought: already ${decision.limitCount ?? 2} new buys today.`;
    case "pacing_strategy":
      return `Not bought: already ${decision.limitCount ?? 2} ${strategyName(decision.strategy)} buys today.`;
    case "strategy_full":
      return `Not bought: already ${decision.limitCount ?? 4} ${strategyName(decision.strategy)} positions open.`;
    case "pacing_cash":
      return "Not bought: today's buy budget is used.";
    case "short_history":
      return "Not bought: not enough price history.";
    default:
      return decision.outcome === "skipped" ? "Not bought." : decision.outcome;
  }
}

export type LedgerDecision = {
  symbol: string;
  outcome: string;
  side?: string | null;
  reasonCode?: string | null;
  sentence: string;
};

export type LedgerDay = {
  label: string;
  tone: "buy" | "sell" | "wait" | "none";
  detail: string;
  items: { symbol: string; sentence: string }[];
};

function skipPhrase(code: string | null | undefined): string {
  switch (code) {
    case "no_funds": return "no cash in Kite";
    case "too_small": return "under the minimum";
    case "too_expensive": return "over the order cap";
    case "sector_cap": return "sector already full";
    case "held": return "already held";
    case "excluded": return "on the exclude list";
    case "chasing": return "price ran too far";
    case "entry_below_stop": return "entry below the stop";
    case "too_close_to_stop": return "price too close to the stop";
    case "tick_unknown": return "tick size missing";
    case "bad_data": return "price data not usable";
    case "limit": return "daily buy limit full";
    case "pacing_day": return "day's new-buy pace";
    case "pacing_strategy": return "strategy's daily pace";
    case "strategy_full": return "strategy already full";
    case "pacing_cash": return "day's buy budget used";
    case "short_history": return "not enough history";
    default: return "not bought";
  }
}

function countWord(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function skipSummary(rows: LedgerDecision[]): string {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const phrase = skipPhrase(row.reasonCode);
    groups.set(phrase, [...(groups.get(phrase) ?? []), row.symbol]);
  }
  const parts = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([phrase, symbols]) => {
      if (phrase === "not bought") return countWord(symbols.length, "name not bought", "names not bought");
      if (symbols.length === 1) return `${symbols[0]} not bought: ${phrase}`;
      return `${symbols.length} names not bought: ${phrase}`;
    });
  if (groups.size === 1) return parts[0];
  return parts.join(". ");
}

/** One line for the ledger. Repeated skips stay a count, not a copied sentence. */
export function ledgerDay(rows: readonly LedgerDecision[]): LedgerDay {
  const items = rows.map((row) => ({ symbol: row.symbol, sentence: row.sentence }));
  if (rows.length === 0) return { label: "No action", tone: "none", detail: "Nothing was decided.", items };
  const sell = (row: LedgerDecision) => (row.side ?? "BUY").toUpperCase() === "SELL";
  const done = (row: LedgerDecision) => row.outcome === "filled";
  const buys = rows.filter((row) => done(row) && !sell(row));
  const sells = rows.filter((row) => done(row) && sell(row));
  const working = rows.filter((row) => row.outcome === "working" || row.outcome === "sent");
  const waiting = rows.filter((row) => row.outcome === "proposed" || row.outcome === "approved");
  const skipped = rows.filter((row) => row.outcome === "skipped");
  const bits = [
    buys.length ? countWord(buys.length, "buy", "buys") : "",
    sells.length ? countWord(sells.length, "sell", "sells") : "",
  ].filter(Boolean);
  let label = bits.join(" · ");
  let tone: LedgerDay["tone"] = sells.length && !buys.length ? "sell" : buys.length ? "buy" : "none";
  if (!label && working.length) {
    label = "Working";
    tone = "wait";
  }
  if (!label && waiting.length) {
    label = "Waiting for you";
    tone = "wait";
  }
  if (!label) label = skipped.length ? "No buys" : "No action";
  const parts: string[] = [];
  for (const row of [...buys, ...sells, ...working]) parts.push(`${row.symbol}: ${row.sentence.replace(/\.$/, "")}`);
  if (waiting.length) {
    const names = waiting.map((row) => row.symbol).join(", ");
    parts.push(waiting.length === 1 ? `${names} is ready` : `${names} are ready`);
  }
  if (skipped.length) parts.push(skipSummary(skipped));
  return { label, tone, detail: `${parts.join(". ")}.`, items };
}

export const CASH_RECHECK_CODES = ["no_funds", "too_small", "limit"] as const;

/** A rejected or cancelled buy can free one of these the same day. */
export const PACING_RECHECK_CODES = ["pacing_day", "pacing_strategy", "pacing_cash"] as const;

/** The live price can move away from the stop later the same day. */
export const PRICE_RECHECK_CODES = ["too_close_to_stop"] as const;

export const RECHECK_REASON_CODES = [...CASH_RECHECK_CODES, ...PACING_RECHECK_CODES, ...PRICE_RECHECK_CODES] as const;

export function recheckEligible(outcome: string | null, reasonCode: string | null): boolean {
  if (outcome == null) return true;
  return outcome === "skipped" && reasonCode != null && (RECHECK_REASON_CODES as readonly string[]).includes(reasonCode);
}

export type PaceIdea = { symbol: string; strategy: "rs" | "ema"; notional: number };

export type PaceBook = {
  newBuys: number;
  strategyBuys: { rs: number; ema: number };
  openInStrategy: { rs: number; ema: number };
  /** Committed buys plus proposals already accepted in this pass. The cap uses this. */
  deployed: number;
  /** Deployed before this pass. The baseline uses this so proposals do not inflate it. */
  committed?: number;
  /** Engine can use now, plus what is already deployed. Rises when cash arrives. Never falls. */
  baseline: number | null;
};

export type PaceLimits = {
  maxNewBuysPerDay: number;
  maxBuysPerDay: number;
  maxBuysPerStrategyPerDay: number;
  maxOpenPerStrategy: number;
  maxDailyDeployPct: number;
  engineCanUseNow: number;
};

export type PaceReason = "ok" | "limit" | "pacing_day" | "pacing_strategy" | "strategy_full" | "pacing_cash";

/** The lower of the new-buy pace and the send cap is the one that binds. */
export function dayBuyCap(maxNewBuysPerDay: number, maxBuysPerDay: number): number {
  return Math.min(maxNewBuysPerDay, maxBuysPerDay);
}

/**
 * Day's deploy base. A saved 0 is unset.
 * Rises to deployed + what the engine can use now. Never falls, and never becomes 0.
 */
export function deployBaseline(saved: number | null | undefined, deployed: number, engineCanUseNow: number): number | null {
  const kept = saved != null && saved > 0 ? saved : null;
  if (!(engineCanUseNow > 0)) return kept;
  const next = Math.max(kept ?? 0, deployed + engineCanUseNow);
  return next > 0 ? next : null;
}

/**
 * Walk today's candidates in order. Locks the cash baseline only when a buy is in hand
 * and the engine can use cash. Open positions are not increased here: a proposal is not a fill.
 */
export function paceBuys(ideas: readonly PaceIdea[], book: PaceBook, limits: PaceLimits): {
  results: { symbol: string; strategy: "rs" | "ema"; outcome: "proposed" | "skipped"; reason: PaceReason }[];
  book: PaceBook;
} {
  const committed = book.committed ?? book.deployed;
  const baseline = ideas.length
    ? deployBaseline(book.baseline, committed, limits.engineCanUseNow)
    : book.baseline != null && book.baseline > 0
      ? book.baseline
      : null;
  const next: PaceBook = {
    newBuys: book.newBuys,
    strategyBuys: { ...book.strategyBuys },
    openInStrategy: { ...book.openInStrategy },
    deployed: book.deployed,
    committed: ideas.length ? committed : book.committed,
    baseline,
  };
  const cap = (baseline ?? 0) * limits.maxDailyDeployPct;
  const dayCap = dayBuyCap(limits.maxNewBuysPerDay, limits.maxBuysPerDay);
  const results: { symbol: string; strategy: "rs" | "ema"; outcome: "proposed" | "skipped"; reason: PaceReason }[] = [];
  for (const idea of ideas) {
    let reason: PaceReason = "ok";
    if (next.newBuys >= dayCap) reason = limits.maxNewBuysPerDay <= limits.maxBuysPerDay ? "pacing_day" : "limit";
    else if (next.strategyBuys[idea.strategy] >= limits.maxBuysPerStrategyPerDay) reason = "pacing_strategy";
    else if (next.openInStrategy[idea.strategy] >= limits.maxOpenPerStrategy) reason = "strategy_full";
    else if (next.deployed + idea.notional > cap + 1e-6) reason = "pacing_cash";
    if (reason === "ok") {
      next.newBuys += 1;
      next.strategyBuys[idea.strategy] += 1;
      next.deployed += idea.notional;
      results.push({ symbol: idea.symbol, strategy: idea.strategy, outcome: "proposed", reason });
    } else {
      results.push({ symbol: idea.symbol, strategy: idea.strategy, outcome: "skipped", reason });
    }
  }
  return { results, book: next };
}

/** Promote a cash skip only. Held, sector, and the other hard skips stay skipped. */
export function recheckPlan(input: {
  outcome: string | null;
  reasonCode: string | null;
  sizingReason: string;
  buysSent: number;
  maxBuys: number;
  openPositions: number;
  maxPositions: number;
  sectorCount: number;
  maxPerSector: number;
}): "propose" | "leave" {
  if (!recheckEligible(input.outcome, input.reasonCode)) return "leave";
  if (input.buysSent >= input.maxBuys) return "leave";
  if (input.openPositions >= input.maxPositions) return "leave";
  if (input.sectorCount >= input.maxPerSector) return "leave";
  if (input.sizingReason !== "ok") return "leave";
  return "propose";
}

/** 09:15–14:30 IST, every fifth minute, or the next tick after a Home request. */
export function recheckDue(minute: number, openRequest: boolean): boolean {
  if (minute < 9 * 60 + 15 || minute > 14 * 60 + 30) return false;
  return openRequest || minute % 5 === 0;
}

export function isBoughtOrSold(row: {
  kind: "decision" | "order" | "gtt_exit";
  status?: string | null;
  filled?: number | null;
  dryRun: boolean;
}, includeDry: boolean): boolean {
  if (row.dryRun && !includeDry) return false;
  if (row.kind === "decision") return false;
  const status = (row.status ?? "").toUpperCase();
  const filled = row.filled ?? (status === "COMPLETE" ? 1 : 0);
  return filled > 0 || status === "COMPLETE";
}

export type AlertRow = { id: number; code: string; message: string; level: string; seen: boolean; symbol?: string | null };

export type AlertGroup<T extends AlertRow> = T & { repeat: number; ids: number[] };

/** Repeated morning checks. Everything else stays per stock. */
export const MORNING_ALERT_CODES = ["kite_cash_low", "kite_login_needed"] as const;

export function isMorningAlert(code: string): boolean {
  return (MORNING_ALERT_CODES as readonly string[]).includes(code);
}

export function alertSymbol(symbol: string | null | undefined): string | null {
  const text = symbol?.trim() ?? "";
  return text ? text : null;
}

/** Marking `target` seen also marks `row` when they share a collapsed group. */
export function alertClearedWith(
  target: { id: number; code: string; symbol?: string | null; message?: string },
  row: { id: number; code: string; symbol?: string | null; message?: string },
): boolean {
  if (row.code !== target.code) return false;
  if (isMorningAlert(target.code)) return true;
  const symbol = alertSymbol(target.symbol);
  if (!symbol) {
    if (target.message == null || row.message == null) return row.id === target.id;
    return row.message === target.message;
  }
  return alertSymbol(row.symbol) === symbol;
}

function alertGroupKey(row: { id: number; code: string; message: string; symbol?: string | null; seen: boolean }): string {
  const seen = row.seen ? "seen" : "open";
  if (isMorningAlert(row.code)) return `${row.code}|${seen}`;
  const symbol = alertSymbol(row.symbol);
  if (!symbol) return `${row.code}|${row.message}|${seen}`;
  return `${row.code}|${symbol}|${seen}`;
}

/** Same morning check, same wording: one row. */
export function collapseAlerts<T extends AlertRow>(rows: readonly T[]): AlertGroup<T>[] {
  const out: AlertGroup<T>[] = [];
  const index = new Map<string, number>();
  for (const row of rows) {
    const key = alertGroupKey(row);
    const at = index.get(key);
    if (at == null) {
      index.set(key, out.length);
      out.push({ ...row, repeat: 1, ids: [row.id] });
    } else {
      out[at].repeat += 1;
      out[at].ids.push(row.id);
    }
  }
  return out;
}

export function alertLabel(level: string): string {
  if (level === "needs_you") return "Needs you";
  if (level === "problem") return "Problem";
  if (level === "done") return "Done";
  const text = level.trim().replace(/[_-]+/g, " ");
  if (!text) return "Other";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ALERT_SECTION_ORDER = ["needs_you", "problem", "done"] as const;

/** Needs you, then problems, then done. Any other level is its own section. */
export function alertSections<T extends { level: string }>(rows: readonly T[]): { level: string; label: string; rows: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const level = row.level.trim() || "other";
    buckets.set(level, [...(buckets.get(level) ?? []), row]);
  }
  const ordered = [
    ...ALERT_SECTION_ORDER.filter((level) => buckets.has(level)),
    ...[...buckets.keys()].filter((level) => !(ALERT_SECTION_ORDER as readonly string[]).includes(level)).sort(),
  ];
  return ordered.map((level) => ({ level, label: alertLabel(level), rows: buckets.get(level) ?? [] }));
}

/** The old cash alert was one sentence repeated by every preflight run. */
export function alertBody(row: { code: string; message: string }): string {
  if (row.code !== "kite_cash_low" || !/below system cash/i.test(row.message)) return row.message;
  const amount = row.message.match(/₹\s?([\d,]+)/)?.[1] ?? "";
  const gap = amount ? `₹${amount}` : "the full book";
  return `Kite cash is short of the book by ${gap}. Buys wait until Kite shows that cash. Dry run does not send a real order. This check repeats each morning run, so it is shown once.`;
}

export type AuditView = "all" | "working" | "bought" | "sold" | "engine" | "you";

export function auditInView(row: { actor: string; action: string; side: string | null }, view: AuditView): boolean {
  if (view === "all") return true;
  const side = (row.side ?? "").toUpperCase();
  if (view === "working") return row.action === "order.sent" || row.action === "gtt.exit";
  if (view === "bought") return row.action === "fill" && side !== "SELL";
  if (view === "sold") return (row.action === "fill" && side === "SELL") || row.action === "position.marked_sold";
  if (view === "you") return row.actor !== "engine" && row.actor !== "kite";
  const ticket = row.action === "order.sent" || row.action === "fill" || row.action === "gtt.exit" || row.action === "position.marked_sold";
  return (row.actor === "engine" || row.actor === "kite") && !ticket;
}

export function auditLabel(action: string, side: string | null): string {
  const upper = (side ?? "").toUpperCase();
  if (action === "order.sent") return upper === "SELL" ? "Sell sent" : upper === "BUY" ? "Buy sent" : "Order sent";
  if (action === "fill") return upper === "SELL" ? "Sell filled" : upper === "BUY" ? "Buy filled" : "Filled";
  if (action === "gtt.exit") return "Stop sold";
  if (action === "position.marked_sold") return "Marked sold";
  if (action === "approval.approve") return "You approved";
  if (action === "approval.skip") return "You skipped";
  if (action === "sizing") return "Sized an order";
  if (action === "reconcile") return "Checked holdings";
  if (action === "stop.updated") return "Stop moved";
  if (action === "alert") return "Raised an alert";
  if (action === "setting.change") return "Setting changed";
  if (action === "kite.login") return "Kite connected";
  if (action === "state.auto_resume") return "Trading resumed";
  if (action.endsWith(".skipped")) return "Waited for Kite";
  if (action === "kite.disconnect") return "Kite disconnected";
  if (action.startsWith("fund.")) return "Trading limit change";
  if (action === "run.error") return "Engine error";
  if (action.startsWith("run.")) return runLabel(action.slice(4));
  if (action === "decision.skip") return "Skipped a name";
  if (action === "recheck") return "Re-checked cash";
  if (action === "recheck.request") return "Asked for a re-check";
  if (action === "order.cancelled") return "Order cancelled";
  if (action === "order.cancel_failed") return "Cancel failed";
  return action;
}

export type EngineGroupId = "all" | "sizing" | "runs" | "skips" | "stops" | "holdings" | "alerts" | "problems" | "recheck" | "other";

export const ENGINE_GROUPS: { id: EngineGroupId; label: string }[] = [
  { id: "all", label: "All engine" },
  { id: "sizing", label: "Sizing" },
  { id: "runs", label: "Runs" },
  { id: "skips", label: "Skips" },
  { id: "stops", label: "Stops" },
  { id: "holdings", label: "Holdings" },
  { id: "alerts", label: "Alerts" },
  { id: "problems", label: "Problems" },
  { id: "recheck", label: "Re-checks" },
  { id: "other", label: "Other" },
];

function runLabel(kind: string): string {
  const names: Record<string, string> = {
    preflight: "Morning check",
    sync: "Synced orders",
    remind: "Kite reminder",
    sells: "Checked sells",
    buys: "Checked buys",
    "import-ideas": "Imported ideas",
    approvals: "Approval pass",
    eod: "End of day",
    "eod-final": "End of day, final",
    "eod-stops": "Stop check",
    cancel: "Cancel pass",
    refresh: "Refreshed prices",
  };
  return names[kind] ?? "Engine run";
}

const ENGINE_ACTIONS: Record<Exclude<EngineGroupId, "all" | "runs" | "other">, readonly string[]> = {
  sizing: ["sizing"],
  skips: ["decision.skip"],
  stops: ["stop.updated"],
  holdings: ["reconcile"],
  alerts: ["alert"],
  problems: ["run.error", "order.cancel_failed"],
  recheck: ["recheck"],
};

export function engineGroup(action: string): EngineGroupId {
  if (action === "run.error" || action === "order.cancel_failed") return "problems";
  if (action.startsWith("run.")) return "runs";
  for (const [id, actions] of Object.entries(ENGINE_ACTIONS) as [Exclude<EngineGroupId, "all" | "runs" | "other">, readonly string[]][]) {
    if ((actions as readonly string[]).includes(action)) return id;
  }
  return "other";
}

export function knownEngineActions(): string[] {
  return Object.values(ENGINE_ACTIONS).flat();
}

export function actionsForEngineGroup(group: EngineGroupId): string[] | null {
  if (group === "all" || group === "other" || group === "runs") return null;
  return [...ENGINE_ACTIONS[group]];
}

export function auditDayKey(ts: string): string {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

type AuditCollapseRow = {
  id: number;
  ts: string;
  action: string;
  symbol: string | null;
  reason: string;
};

/** Same engine line, same stock, same IST day: one row. Newest id is kept. */
export function collapseAuditRows<T extends AuditCollapseRow>(rows: readonly T[]): (T & { repeat: number })[] {
  const out: (T & { repeat: number })[] = [];
  const index = new Map<string, number>();
  const ordered = [...rows].sort((a, b) => b.id - a.id);
  for (const row of ordered) {
    const key = `${auditDayKey(row.ts)}|${row.action}|${row.symbol ?? ""}|${row.reason}`;
    const at = index.get(key);
    if (at == null) {
      index.set(key, out.length);
      out.push({ ...row, repeat: 1 });
    } else {
      out[at].repeat += 1;
    }
  }
  return out;
}

export function groupAuditByDay<T extends { ts: string }>(rows: readonly T[]): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const day = auditDayKey(row.ts);
    const last = out[out.length - 1];
    if (!last || last.day !== day) out.push({ day, rows: [row] });
    else last.rows.push(row);
  }
  return out;
}
