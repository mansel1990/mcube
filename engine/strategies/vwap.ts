import { barClock } from "../backtest/session";
import type { Bar, ClosedTrade } from "./math";
import type { Side, Signal, StrategyDef } from "./types";

/** VWAP trend. Long above the session VWAP, short below, flat on the last bar. At most a few flips a day. */
export function vwapTrend(bars: Bar[]): ClosedTrade[] {
  const trades: ClosedTrade[] = [];
  const days = new Map<string, Bar[]>();
  for (const bar of bars) {
    const day = bar.t.slice(0, 10);
    const list = days.get(day) ?? [];
    list.push(bar);
    days.set(day, list);
  }
  for (const day of days.values()) {
    let pv = 0;
    let vol = 0;
    let side: "long" | "short" | null = null;
    let entry = 0;
    let entryT = "";
    let flips = 0;
    for (let i = 0; i < day.length; i++) {
      const typical = (day[i].h + day[i].l + day[i].c) / 3;
      pv += typical * day[i].v;
      vol += day[i].v;
      const vwap = vol > 0 ? pv / vol : day[i].c;
      const next: "long" | "short" = day[i].c >= vwap ? "long" : "short";
      const last = i === day.length - 1;
      if (side && (next !== side || last || flips >= 3)) {
        trades.push({ entry: entryT, exit: day[i].t, side, entryPx: entry, exitPx: day[i].c });
        side = null;
        if (last || flips >= 3) continue;
      }
      if (!side && !last) {
        side = next;
        entry = day[i].c;
        entryT = day[i].t;
        flips += 1;
      }
    }
  }
  return trades;
}

/** Long above the session VWAP, short below, flipping on a cross. At most `maxFlips` entries a day. */
export const vwapStrategy: StrategyDef = {
  name: "vwap",
  book: "intraday",
  params: {
    maxFlips: { default: 3, grid: [2, 3, 4] },
    /** Establish the first regime without trading it; only a later cross can enter. */
    warmupMinutes: { default: 15, grid: [] },
    /** Neutral band around VWAP as a fraction of the prior daily ATR. */
    bufferAtrFrac: { default: 0.05, grid: [] },
    /** Stop distance as a fraction of the prior daily ATR. */
    stopAtrFrac: { default: 0.25, grid: [] },
  },
  signals(ctx) {
    let pv = 0;
    let vol = 0;
    let side: Side | null = null;
    let flips = 0;
    const out: Signal[] = [];
    const maxFlips = ctx.params.maxFlips;
    for (let i = 0; i < ctx.bars.length - 1; i++) {
      const clock = barClock(ctx.bars[i].t);
      if (clock < "09:15" || clock >= "15:15") continue;
      const bar = ctx.bars[i];
      const typical = (bar.h + bar.l + bar.c) / 3;
      pv += typical * bar.v;
      vol += bar.v;
      const vwap = vol > 0 ? pv / vol : bar.c;
      if (minutesSinceOpen(clock) < ctx.params.warmupMinutes) continue;
      const next = sideAt(bar.c, vwap, buffer(ctx));
      if (!next) continue;
      if (side == null) {
        side = next;
        continue;
      }
      if (next === side) continue;
      if (flips >= maxFlips) break;
      const stop = next === "long" ? bar.c * 0.995 : bar.c * 1.005;
      const selected = Number(ctx.cache?.get("selectionScore"));
      out.push({ at: i, side: next, score: Number.isFinite(selected) ? selected : vol, stop });
      side = next;
      flips += 1;
    }
    return out;
  },
  afterClose(ctx, i) {
    const wanted = vwapSide(ctx, i);
    if (!wanted || wanted === ctx.side) return { exit: false, stop: ctx.stop };
    return { exit: true, stop: ctx.stop };
  },
  bracket(entryPx, signal, ctx) {
    const atrDistance = (ctx.atr ?? 0) * ctx.params.stopAtrFrac;
    const distance = atrDistance > 0 ? atrDistance : entryPx * 0.005;
    const stop = signal.side === "long" ? entryPx - distance : entryPx + distance;
    return { stop, target: null };
  },
};

function vwapSide(ctx: { bars: Bar[]; atr?: number; params: Record<string, number> }, end: number): Side | null {
  let pv = 0;
  let vol = 0;
  let side: Side | null = null;
  for (let i = 0; i <= end; i++) {
    const clock = barClock(ctx.bars[i].t);
    if (clock < "09:15" || clock >= "15:15") continue;
    const bar = ctx.bars[i];
    const typical = (bar.h + bar.l + bar.c) / 3;
    pv += typical * bar.v;
    vol += bar.v;
    const vwap = vol > 0 ? pv / vol : bar.c;
    if (minutesSinceOpen(clock) < ctx.params.warmupMinutes) continue;
    side = sideAt(bar.c, vwap, buffer(ctx)) ?? side;
  }
  return side;
}

function buffer(ctx: { atr?: number; params: Record<string, number> }): number {
  return Math.max(0, (ctx.atr ?? 0) * (ctx.params.bufferAtrFrac ?? 0));
}

function sideAt(close: number, vwap: number, band: number): Side | null {
  if (close > vwap + band) return "long";
  if (close < vwap - band) return "short";
  return null;
}

function minutesSinceOpen(clock: string): number {
  const hour = Number(clock.slice(0, 2));
  const minute = Number(clock.slice(3, 5));
  return hour * 60 + minute - (9 * 60 + 15);
}
