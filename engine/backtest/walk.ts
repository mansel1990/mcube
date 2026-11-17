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
  marks: { date: string; close: number }[];
};

export type WalkOptions = {
  symbol: string;
  tick: number;
  slip: number;
  from: string;
  to: string;
  /** Live GTT sits this far under the trend stop. 0 fills at the trend stop itself. */
  gttGap: number;
};

type OpenPos = {
  signal: Signal;
  entryIndex: number;
  entryPx: number;
  stop: number;
  marks: { date: string; close: number }[];
};

export function walkSymbol(strategy: StrategyDef, ctx: SignalContext, opts: WalkOptions): WalkTrade[] {
  const { bars } = ctx;
  if (bars.length < 3) return [];
  if (!ctx.cache) ctx.cache = new Map();
  const at = new Map<number, Signal>();
  for (const signal of strategy.signals(ctx)) {
    if (signal.at < 0 || signal.at >= bars.length - 1) continue;
    const prev = at.get(signal.at);
    if (!prev || signal.score > prev.score) at.set(signal.at, signal);
  }
  const trades: WalkTrade[] = [];
  let enterNext: Signal | null = null;
  let exitNext = false;
  let pos: OpenPos | null = null;

  const push = (exitIndex: number, exitPx: number, reason: string) => {
    if (!pos) return;
    trades.push({
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
    });
    pos = null;
    exitNext = false;
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const day = barDay(bar.t);
    if (exitNext && pos) {
      const level = protective(pos.stop, pos.signal.side, opts.gttGap);
      if (gapped(bar, pos.signal.side, level) || touched(bar, pos.signal.side, level)) {
        push(i, stopFill(bar, pos.signal.side, level, opts.tick), "stop");
      } else {
        push(i, slipped(bar.o, pos.signal.side, "exit", opts.slip, opts.tick), "rule");
      }
    }
    if (enterNext && !pos && day >= opts.from && day <= opts.to) {
      const signal = enterNext;
      const entryPx = slipped(bar.o, signal.side, "entry", opts.slip, opts.tick);
      const belowStop = signal.side === "long" ? !(signal.stop < entryPx) : !(signal.stop > entryPx);
      const blocked = belowStop || (signal.minEntry != null && entryPx < signal.minEntry - 1e-9);
      if (!blocked && entryPx > 0) {
        pos = { signal, entryIndex: i, entryPx, stop: signal.stop, marks: [] };
        const level = protective(pos.stop, pos.signal.side, opts.gttGap);
        if (touched(bar, pos.signal.side, level)) push(i, stopFill(bar, pos.signal.side, level, opts.tick), "stop");
        else pos.marks.push({ date: day, close: bar.c });
      }
    }
    enterNext = null;
    if (pos && barsHeld(pos, i)) {
      const level = protective(pos.stop, pos.signal.side, opts.gttGap);
      if (touched(bar, pos.signal.side, level)) {
        push(i, stopFill(bar, pos.signal.side, level, opts.tick), "stop");
      } else if (i === bars.length - 1 || day > opts.to) {
        push(i, slipped(bar.c, pos.signal.side, "exit", opts.slip, opts.tick), "window");
      } else {
        if (pos.marks[pos.marks.length - 1]?.date !== day) pos.marks.push({ date: day, close: bar.c });
        const decision = strategy.afterClose({ ...ctx, entryAt: pos.entryIndex, side: pos.signal.side, stop: pos.stop }, i);
        pos.stop = decision.stop > 0 ? decision.stop : pos.stop;
        if (decision.exit) exitNext = true;
      }
    }
    if (!pos && !exitNext && i < bars.length - 1 && day <= opts.to) {
      const signal = at.get(i);
      const nextDay = barDay(bars[i + 1].t);
      if (signal && nextDay >= opts.from && nextDay <= opts.to) enterNext = signal;
    }
  }
  if (pos) {
    const last = bars.length - 1;
    push(last, slipped(bars[last].c, pos.signal.side, "exit", opts.slip, opts.tick), "window");
  }
  return trades;
}

function barsHeld(pos: OpenPos, i: number): boolean {
  return i > pos.entryIndex;
}

function protective(stop: number, side: "long" | "short", gap: number): number {
  if (!(gap > 0)) return stop;
  return side === "long" ? stop * (1 - gap) : stop * (1 + gap);
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
