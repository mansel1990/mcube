import { smaAt } from "./indicators";
import { indexAllows } from "./index-filter";
import type { Signal, StrategyDef } from "./types";

/** Minervini-style breakout. A signal uses only bars closed on or before `at`. */
export const trendBreakout: StrategyDef = {
  name: "trend_breakout",
  book: "swing",
  params: {
    volMult: { default: 1.5, grid: [1.2, 1.5, 2] },
    nearHigh: { default: 0.75, grid: [0.7, 0.75, 0.8] },
    /** 0 keeps new buys free of this average. Open positions are not closed by it. */
    indexDays: { default: 0, grid: [100, 150, 200] },
  },
  signals(ctx) {
    const { bars, params } = ctx;
    const closes = bars.map((bar) => bar.c);
    const volumes = bars.map((bar) => bar.v);
    const out: Signal[] = [];
    for (let i = 252; i < bars.length - 1; i++) {
      let high52 = bars[i - 251].h;
      for (let k = i - 250; k <= i; k++) if (bars[k].h > high52) high52 = bars[k].h;
      const avg50 = smaAt(closes, i, 50);
      const avg150 = smaAt(closes, i, 150);
      const avg200 = smaAt(closes, i, 200);
      const avgVol = smaAt(volumes, i, 20);
      let priorHigh = bars[i - 20].h;
      for (let k = i - 19; k < i; k++) if (bars[k].h > priorHigh) priorHigh = bars[k].h;
      if (avg50 == null || avg150 == null || avg200 == null || avgVol == null) continue;
      const nearHigh = bars[i].c >= high52 * params.nearHigh && bars[i].c <= high52;
      const stacked = bars[i].c > avg50 && avg50 > avg150 && avg150 > avg200;
      const breakout = bars[i].c > priorHigh && bars[i].v >= avgVol * params.volMult;
      const strong = Number.isFinite(ctx.rank[i]) && ctx.rank[i] >= 0.7;
      if (!nearHigh || !stacked || !breakout || !strong) continue;
      if (!indexAllows(ctx.indexClose, i, ctx.params.indexDays ?? 0)) continue;
      let stop = bars[i].l;
      for (let k = i - 9; k < i; k++) if (k >= 0 && bars[k].l < stop) stop = bars[k].l;
      if (!(stop > 0) || stop >= bars[i].c) continue;
      out.push({ at: i, side: "long", score: bars[i].c / high52, stop, useLimit: true });
    }
    return out;
  },
  afterClose(ctx, i) {
    const closes = ctx.bars.map((bar) => bar.c);
    const avg = smaAt(closes, i, 21);
    return { exit: avg != null && ctx.bars[i].c < avg, stop: ctx.stop };
  },
};
