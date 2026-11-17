import { rsi, sma } from "./math";
import { smaAt } from "./indicators";
import type { Signal, StrategyDef } from "./types";

/** Connors RSI(2). Entry is the next bar. Exit is a close above the 5-day average, or the hold limit. */
export const rsi2: StrategyDef = {
  name: "rsi2",
  book: "swing",
  params: {
    rsiMax: { default: 10, grid: [5, 10, 15] },
    maxHold: { default: 10, grid: [5, 10, 15] },
  },
  signals(ctx) {
    const closes = ctx.bars.map((bar) => bar.c);
    const out: Signal[] = [];
    for (let i = 200; i < ctx.bars.length - 1; i++) {
      const avg200 = sma(closes, i, 200);
      const value = rsi(closes, i, 2);
      if (avg200 == null || value == null || ctx.bars[i].c <= avg200 || value >= ctx.params.rsiMax) continue;
      const stop = ctx.bars[i].l;
      if (!(stop > 0) || stop >= ctx.bars[i].c) continue;
      out.push({ at: i, side: "long", score: ctx.params.rsiMax - value, stop });
    }
    return out;
  },
  afterClose(ctx, i) {
    const closes = ctx.bars.map((bar) => bar.c);
    const avg5 = smaAt(closes, i, 5);
    const held = i - ctx.entryAt;
    const exit = held >= ctx.params.maxHold || (avg5 != null && ctx.bars[i].c > avg5);
    return { exit, stop: ctx.stop };
  },
};
