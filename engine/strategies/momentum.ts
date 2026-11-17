import { indexAllows } from "./index-filter";
import type { Signal, StrategyDef } from "./types";

/**
 * Weekly momentum. Rebalance on the last session of the week (Friday, or the
 * session before it when Friday is a holiday). Hold names in the top slice of
 * 90-day returns while NIFTY 50's close is above its 200-day average.
 * There is no price stop: a 20-day low made the 1% risk rule reject most of the list.
 */
export const momentum: StrategyDef = {
  name: "momentum",
  book: "swing",
  flexibleEntry: true,
  params: {
    topN: { default: 8, grid: [5, 6, 7, 8] },
    /** 0 keeps new buys free of this average. Open positions are not closed by it. */
    indexDays: { default: 0, grid: [100, 150, 200] },
    /** Above 0, a daily exit when the name leaves that rank. 0 keeps the weekly exit. */
    exitTop: { default: 0, grid: [] },
    /** Above 0, a stop this far under the fill. Sized to the order cap either way. */
    stopPct: { default: 0, grid: [] },
  },
  signals(ctx) {
    const out: Signal[] = [];
    const topN = ctx.params.topN;
    for (let i = 90; i < ctx.bars.length - 1; i++) {
      if (!isWeekEnd(ctx.bars, i)) continue;
      if (!inMomentum(ctx, i, topN)) continue;
      if (!indexAllows(ctx.indexClose, i, ctx.params.indexDays ?? 0)) continue;
      out.push({ at: i, side: "long", score: ctx.rank[i], stop: 0, priceStop: false, useLimit: true, sizeToCap: true });
    }
    return out;
  },
  afterClose(ctx, i) {
    const exitTop = ctx.params.exitTop ?? 0;
    if (exitTop > 0) return { exit: !inTop(ctx, i, exitTop), stop: ctx.stop };
    if (!isWeekEnd(ctx.bars, i)) return { exit: false, stop: ctx.stop };
    return { exit: !inMomentum(ctx, i, ctx.params.topN), stop: ctx.stop };
  },
};

export function inTop(
  ctx: { rank: Float64Array; rankN: Float64Array },
  i: number,
  topN: number
): boolean {
  const n = ctx.rankN[i];
  const pct = ctx.rank[i];
  if (!Number.isFinite(pct) || !(n >= 2)) return false;
  const better = (1 - pct) * (n - 1);
  return better < topN - 1e-9;
}

export function inMomentum(
  ctx: { rank: Float64Array; rankN: Float64Array; indexUp: Uint8Array },
  i: number,
  topN: number
): boolean {
  const n = ctx.rankN[i];
  const pct = ctx.rank[i];
  if (!ctx.indexUp[i] || !Number.isFinite(pct) || !(n >= 2)) return false;
  const better = (1 - pct) * (n - 1);
  return better < topN - 1e-9;
}

function isWeekEnd(bars: { t: string }[], i: number): boolean {
  const next = bars[i + 1];
  if (!next) return false;
  return isoWeek(bars[i].t) !== isoWeek(next.t);
}

function isoWeek(day: string): string {
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const week = Math.ceil(((date.getTime() - start) / 86400000 + 1) / 7);
  return `${year}-${week}`;
}
