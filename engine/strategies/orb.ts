import { barClock } from "../backtest/session";
import { atr, type Bar, type ClosedTrade } from "./math";
import type { Signal, StrategyDef } from "./types";

/** Opening-range breakout on intraday bars. Flat on the last bar of each session. */
export function orb(bars: Bar[], rangeBars: number): ClosedTrade[] {
  const trades: ClosedTrade[] = [];
  const days = new Map<string, Bar[]>();
  for (const bar of bars) {
    const day = bar.t.slice(0, 10);
    const list = days.get(day) ?? [];
    list.push(bar);
    days.set(day, list);
  }
  for (const day of days.values()) {
    if (day.length <= rangeBars + 1) continue;
    const opening = day.slice(0, rangeBars);
    const high = Math.max(...opening.map((bar) => bar.h));
    const low = Math.min(...opening.map((bar) => bar.l));
    const firstUp = opening[0].c >= opening[0].o;
    const stopDist = atr(day, rangeBars, Math.min(14, rangeBars)) ?? (high - low);
    let side: "long" | "short" | null = null;
    let entry = 0;
    let entryT = "";
    for (let i = rangeBars; i < day.length - 1; i++) {
      if (!side && firstUp && day[i].h > high) {
        side = "long";
        entry = high;
        entryT = day[i].t;
      } else if (!side && !firstUp && day[i].l < low) {
        side = "short";
        entry = low;
        entryT = day[i].t;
      }
      if (!side) continue;
      const stop = side === "long" ? entry - stopDist : entry + stopDist;
      const stopped = side === "long" ? day[i].l <= stop : day[i].h >= stop;
      if (stopped || i === day.length - 2) {
        const exitPx = stopped ? stop : day[day.length - 1].c;
        trades.push({ entry: entryT, exit: day[Math.min(i + 1, day.length - 1)].t, side, entryPx: entry, exitPx });
        break;
      }
    }
  }
  return trades;
}

/** Opening-range breakout. The range is the first 5 or 15 minutes. Stop is a fraction of the prior 14-day ATR. */
export const orbStrategy: StrategyDef = {
  name: "orb",
  book: "intraday",
  params: {
    rangeMinutes: { default: 15, grid: [5, 15] },
    atrFrac: { default: 0.5, grid: [0.25, 0.5, 1] },
  },
  signals(ctx) {
    const bars = ctx.bars.filter((bar) => {
      const clock = barClock(bar.t);
      return clock >= "09:15" && clock < "15:15";
    });
    const rangeBars = Math.max(1, Math.round(ctx.params.rangeMinutes / 5));
    if (bars.length <= rangeBars + 1) return [];
    const opening = bars.slice(0, rangeBars);
    let high = opening[0].h;
    let low = opening[0].l;
    for (const bar of opening) {
      if (bar.h > high) high = bar.h;
      if (bar.l < low) low = bar.l;
    }
    const firstUp = opening[0].c >= opening[0].o;
    const indexOf = new Map(ctx.bars.map((bar, index) => [bar, index]));
    for (let i = rangeBars; i < bars.length - 1; i++) {
      const brokeUp = firstUp && bars[i].h > high;
      const brokeDown = !firstUp && bars[i].l < low;
      if (!brokeUp && !brokeDown) continue;
      const at = indexOf.get(bars[i]);
      if (at == null) continue;
      const side = brokeUp ? "long" : "short";
      const selected = Number(ctx.cache?.get("selectionScore"));
      const score = Number.isFinite(selected) ? selected : bars[i].v;
      return [{ at, side, score, stop: side === "long" ? low : high, range: Math.max(0.01, high - low) } satisfies Signal];
    }
    return [];
  },
  afterClose(ctx) {
    return { exit: false, stop: ctx.stop };
  },
  bracket(entryPx, signal, ctx) {
    const width = ctx.atr != null && ctx.atr > 0 ? ctx.atr * ctx.params.atrFrac : (signal.range ?? 0) * ctx.params.atrFrac;
    const dist = Math.max(0.01, width);
    if (signal.side === "long") return { stop: entryPx - dist, target: entryPx + dist };
    return { stop: entryPx + dist, target: entryPx - dist };
  },
};
