import { buyTooCloseToStop, roundTick } from "@/lib/mlive/rules";
import type { Signal, SignalContext, StrategyDef } from "../strategies/types";
import type { Bar } from "../strategies/math";
import { slipped } from "./money";
import { barDay } from "./session";

export type WalkTrade = {
  symbol: string;
  side: "long" | "short";
  score: number;
  entryDate: string;
  exitDate: string;
  entryTs: string;
  exitTs: string;
  entryPx: number;
  exitPx: number;
  stop: number;
  exitReason: string;
  barsHeld: number;
  marks: { date: string; close: number; open?: number }[];
  /** Open of the exit bar, so a loss can be checked against a gap. */
  exitOpen?: number;
  /** Intraday backstop live at the exit. The trend stop when there is no GTT gap. */
  protective?: number;
  priceStop?: boolean;
  /** Size to the order cap. Set on momentum, including when it has a price stop. */
  sizeToCap?: boolean;
  /** Half the position leaves at this next open. The rest keeps the trail. */
  scaleOut?: { date: string; px: number };
  /** Adverse exit used for sizing. RS is the trend stop times 0.97 times 0.99. */
  riskStop?: number;
  fill?: "daily" | "intraday";
  entryLimit?: number;
  entryRaw?: number;
  /** Entry and stop printed in one bar and the order could not be known. */
  ambiguous?: boolean;
  /** The last in-window close asked for a next-open exit that this sample does not contain. */
  pendingExit?: boolean;
  tick?: number;
};

export type WalkResult = { trades: WalkTrade[]; opens: WalkTrade[] };

export type WalkStats = {
  attempted: number;
  unfilled: number;
  dailyApprox?: number;
  intraday?: number;
  ambiguous?: number;
};

export type GateStats = { raw: number; history: number; value: number; kept: number };

export type WalkOptions = {
  symbol: string;
  tick: number;
  slip: number;
  from: string;
  to: string;
  /** Live GTT sits this far under the trend stop. 0 fills at the trend stop itself. */
  gttGap: number;
  /** Live limit is the signal close times one plus this. Used when the signal asks for it. */
  limitOffset?: number;
  /** Skip the limit when the next open is this far above the signal close. */
  chasePct?: number;
  /** Counts entry attempts that the live limit did not fill. */
  stats?: WalkStats;
  /** 5-minute bars for one session. Only 09:45–14:30 are used. */
  sessionBars?: (day: string) => Bar[] | undefined;
  /** Extra gap allowance under the GTT, used only to size risk. RS passes 0.01. */
  riskGap?: number;
  /** Frozen clean-history and traded-value gate. Absent gates do not filter. */
  gate?: (at: number) => "history" | "value" | "ok";
  gateStats?: GateStats;
};

type OpenPos = {
  signal: Signal;
  entryIndex: number;
  entryPx: number;
  stop: number;
  marks: { date: string; close: number; open?: number }[];
  scale?: { date: string; px: number };
  scaled: boolean;
  fill?: "daily" | "intraday";
  entryLimit?: number;
  entryRaw?: number;
  pendingExit?: boolean;
};

type Resolved = { price: number; fill: "daily" | "intraday"; limit: number; raw?: number };

export function walkSymbol(strategy: StrategyDef, ctx: SignalContext, opts: WalkOptions): WalkResult {
  if (strategy.flexibleEntry) return walkFlexible(strategy, ctx, opts);
  const { bars } = ctx;
  if (bars.length < 3) return { trades: [], opens: [] };
  if (!ctx.cache) ctx.cache = new Map();
  const at = new Map<number, Signal>();
  for (const signal of strategy.signals(ctx)) {
    if (signal.at < 0 || signal.at >= bars.length - 1) continue;
    const prev = at.get(signal.at);
    if (!prev || signal.score > prev.score) at.set(signal.at, signal);
  }
  const trades: WalkTrade[] = [];
  const opens: WalkTrade[] = [];
  let enterNext: Signal | null = null;
  let exitNext = false;
  let pos: OpenPos | null = null;

  const push = (exitIndex: number, exitPx: number, reason: string, level: number, exitOpen?: number) => {
    if (!pos) return;
    trades.push(filled(opts, pos, bars, exitIndex, exitPx, reason, level, exitOpen));
    pos = null;
    exitNext = false;
  };

  const recordOpen = (markIndex: number) => {
    if (!pos || markIndex < 0) return;
    const mark = bars[markIndex];
    const day = barDay(mark.t);
    if (pos.marks[pos.marks.length - 1]?.date !== day) pos.marks.push({ date: day, close: mark.c, open: mark.o });
    opens.push(filled(opts, pos, bars, markIndex, mark.c, "open", backstop(pos), mark.o));
    pos = null;
    exitNext = false;
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const day = barDay(bar.t);
    if (pos && day > opts.to) {
      if (exitNext) pos.pendingExit = true;
      recordOpen(i - 1);
      break;
    }
    if (pos?.scaled && !pos.scale && !exitNext) {
      pos.scale = { date: day, px: slipped(bar.o, pos.signal.side, "exit", opts.slip, opts.tick) };
    }
    if (exitNext && pos) {
      const level = backstop(pos);
      if (level > 0 && (gapped(bar, pos.signal.side, level) || touched(bar, pos.signal.side, level))) {
        push(i, stopFill(bar, pos.signal.side, level, opts.tick), "stop", level, bar.o);
      } else {
        push(i, slipped(bar.o, pos.signal.side, "exit", opts.slip, opts.tick), "rule", level, bar.o);
      }
    }
    if (enterNext && !pos && day >= opts.from && day <= opts.to) {
      const signal = enterNext;
      const signalClose = bars[signal.at]?.c ?? bar.o;
      if (opts.stats) opts.stats.attempted += 1;
      const resolved = signal.useLimit ? resolveLimit(bar, opts.sessionBars?.(day), signal, signalClose, opts) : null;
      const entryPx = signal.useLimit ? resolved?.price ?? null : slipped(bar.o, signal.side, "entry", opts.slip, opts.tick);
      const belowStop = signal.priceStop === false ? false : signal.side === "long" ? !(signal.stop < (entryPx ?? 0)) : !(signal.stop > (entryPx ?? 0));
      const blocked = entryPx == null || belowStop || (signal.minEntry != null && entryPx < signal.minEntry - 1e-9);
      if (blocked && opts.stats) opts.stats.unfilled += 1;
      if (!blocked && entryPx != null && entryPx > 0) {
        pos = {
          signal,
          entryIndex: i,
          entryPx,
          stop: signal.stop,
          marks: [],
          scaled: false,
          fill: resolved?.fill,
          entryLimit: resolved?.limit,
          entryRaw: resolved?.raw,
        };
        if (opts.stats && resolved?.fill === "daily") opts.stats.dailyApprox = (opts.stats.dailyApprox ?? 0) + 1;
        if (opts.stats && resolved?.fill === "intraday") opts.stats.intraday = (opts.stats.intraday ?? 0) + 1;
        const level = backstop(pos);
        const stopOrder = level > 0 ? entryStop(bar, opts.sessionBars?.(day), signal.side, level, resolved) : "none";
        if (stopOrder === "ambiguous" && opts.stats) opts.stats.ambiguous = (opts.stats.ambiguous ?? 0) + 1;
        if (stopOrder === "none") pos.marks.push({ date: day, close: bar.c, open: bar.o });
        else {
          const stopBar = stopOrder === "known" ? stopBarAfterFill(opts.sessionBars?.(day), signal.side, level, resolved) ?? bar : bar;
          push(i, stopFill(stopBar, signal.side, level, opts.tick), "stop", level, stopBar.o);
          if (stopOrder === "ambiguous" && trades.length) trades[trades.length - 1].ambiguous = true;
        }
      }
    }
    enterNext = null;
    if (pos && barsHeld(pos, i)) {
      const level = backstop(pos);
      if (level > 0 && touched(bar, pos.signal.side, level)) {
        push(i, stopFill(bar, pos.signal.side, level, opts.tick), "stop", level, bar.o);
      } else if (i === bars.length - 1 || day > opts.to) {
        if (day <= opts.to) {
          const decision = strategy.afterClose({ ...ctx, entryAt: pos.entryIndex, side: pos.signal.side, stop: pos.stop, entryPx: pos.entryPx }, i);
          pos.stop = decision.stop > 0 ? decision.stop : pos.stop;
          if (decision.exit) pos.pendingExit = true;
        }
        recordOpen(day > opts.to ? i - 1 : i);
      } else {
        if (pos.marks[pos.marks.length - 1]?.date !== day) pos.marks.push({ date: day, close: bar.c, open: bar.o });
        const decision = strategy.afterClose({ ...ctx, entryAt: pos.entryIndex, side: pos.signal.side, stop: pos.stop, entryPx: pos.entryPx }, i);
        pos.stop = decision.stop > 0 ? decision.stop : pos.stop;
        if (decision.exit) exitNext = true;
        const multiple = ctx.params.halfR ?? 0;
        const risk = pos.entryPx - pos.signal.stop;
        if (!pos.scaled && multiple > 0 && risk > 0 && bar.c >= pos.entryPx + multiple * risk) pos.scaled = true;
      }
    }
    if (!pos && !exitNext && i < bars.length - 1 && day <= opts.to) {
      const signal = at.get(i);
      const nextDay = barDay(bars[i + 1].t);
      if (signal && nextDay >= opts.from && nextDay <= opts.to && noteGate(opts, i)) enterNext = signal;
    }
  }
  if (pos) recordOpen(bars.length - 1);
  return { trades, opens };

  function backstop(open: OpenPos): number {
    if (open.signal.priceStop === false) return 0;
    return protective(open.stop, open.signal.side, opts.gttGap);
  }
}

function filled(
  opts: WalkOptions,
  pos: OpenPos,
  bars: Bar[],
  exitIndex: number,
  exitPx: number,
  reason: string,
  level: number,
  exitOpen?: number
): WalkTrade {
  return {
    symbol: opts.symbol,
    side: pos.signal.side,
    score: pos.signal.score,
    entryDate: barDay(bars[pos.entryIndex].t),
    exitDate: barDay(bars[exitIndex].t),
    entryTs: bars[pos.entryIndex].t,
    exitTs: bars[exitIndex].t,
    entryPx: pos.entryPx,
    exitPx,
    stop: pos.signal.stop,
    exitReason: reason,
    barsHeld: Math.max(0, exitIndex - pos.entryIndex),
    marks: pos.marks,
    exitOpen,
    protective: level,
    priceStop: pos.signal.priceStop !== false,
    sizeToCap: pos.signal.sizeToCap === true,
    scaleOut: pos.scale,
    riskStop: riskPrice(pos.signal.stop, pos.signal.side, opts),
    fill: pos.fill,
    entryLimit: pos.entryLimit,
    entryRaw: pos.entryRaw,
    pendingExit: pos.pendingExit,
    tick: opts.tick,
  };
}

function barsHeld(pos: OpenPos, i: number): boolean {
  return i > pos.entryIndex;
}

function protective(stop: number, side: "long" | "short", gap: number): number {
  if (!(gap > 0)) return stop;
  return side === "long" ? stop * (1 - gap) : stop * (1 + gap);
}

function riskPrice(stop: number, side: "long" | "short", opts: WalkOptions): number | undefined {
  if (!(opts.riskGap != null && opts.riskGap > 0) || !(opts.gttGap > 0) || !(stop > 0) || opts.riskGap >= 1) return undefined;
  const gtt = side === "long" ? 1 - opts.gttGap : 1 + opts.gttGap;
  const gap = side === "long" ? 1 - opts.riskGap : 1 + opts.riskGap;
  return stop * gtt * gap;
}

function touched(bar: Bar, side: "long" | "short", stop: number): boolean {
  if (!(stop > 0)) return false;
  return side === "long" ? bar.l <= stop : bar.h >= stop;
}

function gapped(bar: Bar, side: "long" | "short", stop: number): boolean {
  return side === "long" ? bar.o < stop : bar.o > stop;
}

function stopFill(bar: Bar, side: "long" | "short", stop: number, tick: number): number {
  const price = gapped(bar, side, stop) ? bar.o : stop;
  return slipped(price, side, "exit", 0, tick);
}

function noteGate(opts: WalkOptions, index: number): boolean {
  if (!opts.gate) return true;
  const gate = opts.gate(index);
  if (opts.gateStats) {
    opts.gateStats.raw += 1;
    if (gate === "history") opts.gateStats.history += 1;
    else if (gate === "value") opts.gateStats.value += 1;
    else opts.gateStats.kept += 1;
  }
  return gate === "ok";
}

function allowed(opts: WalkOptions, index: number): boolean {
  return !opts.gate || opts.gate(index) === "ok";
}

/** Next-session limit. A daily bar fills at the limit only when its range contains that price. */
function resolveLimit(bar: Bar, intraday: Bar[] | undefined, signal: Signal, signalClose: number, opts: WalkOptions): Resolved | null {
  if (!(signalClose > 0)) return null;
  const offset = opts.limitOffset ?? 0.005;
  const chase = opts.chasePct ?? 0.03;
  const tick = opts.tick > 0 ? opts.tick : 0.05;
  const limit = roundTick(signalClose * (1 + offset), tick);
  if (!(limit > 0) || bar.o > signalClose * (1 + chase) + 1e-9) return null;
  if (intraday) {
    const window = intraday.filter((item) => inOrderWindow(item.t));
    for (const piece of window) {
      if (piece.o <= limit + 1e-9) {
        const better = Math.min(limit, slipped(piece.o, signal.side, "entry", opts.slip, tick));
        if (!(better > 0) || buyTooCloseToStop(better, signal.stop)) return null;
        return { price: better, fill: "intraday", limit, raw: piece.o };
      }
      if (piece.l <= limit + 1e-9) {
        if (buyTooCloseToStop(limit, signal.stop)) return null;
        return { price: limit, fill: "intraday", limit };
      }
    }
    return null;
  }
  if (bar.l <= limit + 1e-9 && limit <= bar.h + 1e-9) {
    if (buyTooCloseToStop(limit, signal.stop)) return null;
    return { price: limit, fill: "daily", limit };
  }
  return null;
}

function inOrderWindow(ts: string): boolean {
  const match = ts.match(/(\d{2}):(\d{2})/);
  if (!match) return false;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 9 * 60 + 45 && minute <= 14 * 60 + 30;
}

type StopOrder = "none" | "known" | "ambiguous";

function entryStop(dayBar: Bar, intraday: Bar[] | undefined, side: "long" | "short", level: number, resolved: Resolved | null): StopOrder {
  const window = (intraday ?? []).filter((item) => inOrderWindow(item.t));
  if (resolved?.fill === "intraday" && window.length) {
    let fillAt = -1;
    let stopAt = -1;
    for (let i = 0; i < window.length; i++) {
      const piece = window[i];
      if (fillAt < 0 && (piece.o <= resolved.limit + 1e-9 || piece.l <= resolved.limit + 1e-9)) fillAt = i;
      if (stopAt < 0 && (touched(piece, side, level) || gapped(piece, side, level))) stopAt = i;
    }
    if (fillAt < 0 || stopAt < 0 || stopAt < fillAt) return "none";
    return stopAt === fillAt ? "ambiguous" : "known";
  }
  if (touched(dayBar, side, level) || gapped(dayBar, side, level)) return "ambiguous";
  return "none";
}

function stopBarAfterFill(intraday: Bar[] | undefined, side: "long" | "short", level: number, resolved: Resolved | null): Bar | null {
  if (!resolved) return null;
  const window = (intraday ?? []).filter((item) => inOrderWindow(item.t));
  let seenFill = false;
  for (const piece of window) {
    if (!seenFill && (piece.o <= resolved.limit + 1e-9 || piece.l <= resolved.limit + 1e-9)) seenFill = true;
    if (seenFill && (touched(piece, side, level) || gapped(piece, side, level))) return piece;
  }
  return null;
}

/**
 * One spell can be bought on any later session until the exit.
 * The book keeps a single position per name and ignores the other entry dates.
 */
function walkFlexible(strategy: StrategyDef, ctx: SignalContext, opts: WalkOptions): WalkResult {
  const { bars } = ctx;
  if (bars.length < 3) return { trades: [], opens: [] };
  if (!ctx.cache) ctx.cache = new Map();
  const at = new Map<number, Signal>();
  for (const signal of strategy.signals(ctx)) {
    if (signal.at < 0 || signal.at >= bars.length - 1) continue;
    const prev = at.get(signal.at);
    if (!prev || signal.score > prev.score) at.set(signal.at, signal);
  }
  const trades: WalkTrade[] = [];
  const opens: WalkTrade[] = [];
  let armed: Signal | null = null;
  let entryIndex: number | null = null;
  let active: Signal | null = null;
  let exitNext = false;

  const scoreFor = (start: number): number => {
    for (let k = start - 1; k >= 0; k--) {
      const signal = at.get(k);
      if (signal) return signal.score;
    }
    return active?.score ?? 0;
  };

  const signalFor = (start: number): Signal | null => {
    for (let k = start - 1; k >= 0; k--) {
      const signal = at.get(k);
      if (signal) return signal;
    }
    return active;
  };

  const emit = (exitIndex: number, exitPx: number, reason: string, pending = false) => {
    if (entryIndex == null || !active) return;
    for (let start = entryIndex; start < exitIndex; start++) {
      const day = barDay(bars[start].t);
      if (day < opts.from || day > opts.to) continue;
      const signal = signalFor(start) ?? active;
      if (!allowed(opts, signal.at)) continue;
      const signalClose = bars[signal.at]?.c ?? bars[start].o;
      if (opts.stats && signal.useLimit) opts.stats.attempted += 1;
      const resolved = signal.useLimit ? resolveLimit(bars[start], opts.sessionBars?.(day), signal, signalClose, opts) : null;
      const entryPx = signal.useLimit
        ? resolved?.price ?? null
        : slipped(bars[start].o, signal.side, "entry", opts.slip, opts.tick);
      if (entryPx == null || !(entryPx > 0)) {
        if (opts.stats && signal.useLimit) opts.stats.unfilled += 1;
        continue;
      }
      if (opts.stats && resolved?.fill === "daily") opts.stats.dailyApprox = (opts.stats.dailyApprox ?? 0) + 1;
      if (opts.stats && resolved?.fill === "intraday") opts.stats.intraday = (opts.stats.intraday ?? 0) + 1;
      const stopPct = ctx.params.stopPct ?? 0;
      const stopPx = stopPct > 0 ? entryPx * (1 - stopPct) : 0;
      let end = exitIndex;
      let px = exitPx;
      let why = reason;
      if (why === "open" && barDay(bars[end].t) > opts.to) {
        end = Math.max(start, end - 1);
        px = bars[end].c;
      }
      let ambiguous = false;
      if (stopPx > 0) {
        const stopUntil = why === "open" ? end : exitIndex - 1;
        for (let k = start; k <= stopUntil; k++) {
          const probe = bars[k];
          if (!gapped(probe, signal.side, stopPx) && !touched(probe, signal.side, stopPx)) continue;
          end = k;
          px = stopFill(probe, signal.side, stopPx, opts.tick);
          why = "stop";
          if (k === start) {
            ambiguous = true;
            if (opts.stats) opts.stats.ambiguous = (opts.stats.ambiguous ?? 0) + 1;
          }
          break;
        }
      }
      const marks: { date: string; close: number; open?: number }[] = [];
      const markEnd = why === "open" ? end : end - 1;
      for (let k = start; k <= markEnd; k++) marks.push({ date: barDay(bars[k].t), close: bars[k].c, open: bars[k].o });
      if (marks.length === 0) marks.push({ date: day, close: bars[start].c, open: bars[start].o });
      const trade: WalkTrade = {
        symbol: opts.symbol,
        side: signal.side,
        score: scoreFor(start),
        entryDate: day,
        exitDate: barDay(bars[end].t),
        entryTs: bars[start].t,
        exitTs: bars[end].t,
        entryPx,
        exitPx: px,
        stop: stopPx > 0 ? stopPx : signal.stop,
        exitReason: why === "window" ? "open" : why,
        barsHeld: end - start,
        marks,
        exitOpen: bars[end].o,
        protective: stopPx > 0 ? stopPx : signal.stop,
        priceStop: stopPx > 0 || signal.priceStop !== false,
        sizeToCap: signal.sizeToCap === true,
        fill: resolved?.fill,
        entryLimit: resolved?.limit,
        entryRaw: resolved?.raw,
        ambiguous,
        pendingExit: pending && why !== "stop",
        tick: opts.tick,
      };
      if (trade.exitReason === "open") opens.push(trade);
      else trades.push(trade);
    }
    entryIndex = null;
    active = null;
    exitNext = false;
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const day = barDay(bar.t);
    if (entryIndex != null && active && day > opts.to) {
      emit(i, bars[i - 1].c, "open", exitNext);
      break;
    }
    if (exitNext && entryIndex != null && active) {
      emit(i, slipped(bar.o, active.side, "exit", opts.slip, opts.tick), "rule");
    }
    if (armed && entryIndex == null && day >= opts.from && day <= opts.to) {
      entryIndex = i;
      active = armed;
    }
    armed = null;
    if (entryIndex != null && active && i > entryIndex) {
      if (i === bars.length - 1 || day > opts.to) {
        emit(i, bars[i].c, "open", exitNext);
      } else {
        const decision = strategy.afterClose({ ...ctx, entryAt: entryIndex, side: active.side, stop: active.stop, entryPx: bars[entryIndex].o }, i);
        if (decision.exit) exitNext = true;
      }
    }
    if (entryIndex == null && i < bars.length - 1 && day <= opts.to) {
      const signal = at.get(i);
      const nextDay = barDay(bars[i + 1].t);
      if (signal && nextDay >= opts.from && nextDay <= opts.to && noteGate(opts, i)) armed = signal;
    }
  }
  if (entryIndex != null && active) {
    const last = bars.length - 1;
    emit(last, bars[last].c, "open", exitNext);
  }
  return { trades, opens };
}
