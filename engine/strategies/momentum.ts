import { weekdayUtc } from "./indicators";
import type { Signal, StrategyDef } from "./types";

/**
 * Weekly momentum. On Fridays, hold a name in the top slice of 90-day returns
 * while NIFTY 50's own close is above its 200-day average.
 */
export const momentum: StrategyDef = {
  name: "momentum",
  book: "swing",
  params: {
    topN: { default: 8, grid: [5, 6, 7, 8] },
  },
  signals(ctx) {
    const out: Signal[] = [];
    const topN = ctx.params.topN;
    for (let i = 90; i < ctx.bars.length - 1; i++) {
      if (weekdayUtc(ctx.bars[i].t) !== 5) continue;
      if (!inMomentum(ctx, i, topN)) continue;
      let stop = ctx.bars[i].l;
      const from = Math.max(0, i - 19);
      for (let k = from; k <= i; k++) if (ctx.bars[k].l < stop) stop = ctx.bars[k].l;
      if (!(stop > 0) || stop >= ctx.bars[i].c) continue;
      out.push({ at: i, side: "long", score: ctx.rank[i], stop });
    }
    return out;
  },
  afterClose(ctx, i) {
    if (weekdayUtc(ctx.bars[i].t) !== 5) return { exit: false, stop: ctx.stop };
    return { exit: !inMomentum(ctx, i, ctx.params.topN), stop: ctx.stop };
  },
};

function inMomentum(ctx: { rank: Float64Array; rankN: Float64Array; indexUp: Uint8Array; params: Record<string, number> }, i: number, topN: number): boolean {
  const n = ctx.rankN[i];
  const pct = ctx.rank[i];
  if (!ctx.indexUp[i] || !Number.isFinite(pct) || !(n >= 2)) return false;
  const better = (1 - pct) * (n - 1);
  return better < topN - 1e-9;
}
