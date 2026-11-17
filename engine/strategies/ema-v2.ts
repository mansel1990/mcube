import { smaAt } from "./indicators";
import type { Signal, StrategyDef } from "./types";

/** EMA pullback. Entry is the next session's open. Exit is a close under the fast average. */
export const emaV2: StrategyDef = {
  name: "ema_v2",
  book: "swing",
  params: {
    fast: { default: 20, grid: [15, 20, 25] },
  },
  signals(ctx) {
    const closes = ctx.bars.map((bar) => bar.c);
    const fast = ctx.params.fast;
    const out: Signal[] = [];
    for (let i = 50; i < ctx.bars.length - 1; i++) {
      const avgFast = smaAt(closes, i, fast);
      const avg50 = smaAt(closes, i, 50);
      if (avgFast == null || avg50 == null) continue;
      const pullback = ctx.bars[i].l <= avgFast && ctx.bars[i].c > avgFast && ctx.bars[i].c > avg50;
      if (!pullback || !(avgFast < ctx.bars[i].c)) continue;
      out.push({ at: i, side: "long", score: ctx.bars[i].c / avg50 - 1, stop: avgFast, minEntry: avgFast });
    }
    return out;
  },
  afterClose(ctx, i) {
    const closes = ctx.bars.map((bar) => bar.c);
    const avg = smaAt(closes, i, ctx.params.fast);
    if (avg == null) return { exit: false, stop: ctx.stop };
    const stop = Math.max(ctx.stop, avg);
    return { exit: ctx.bars[i].c < stop, stop };
  },
};
