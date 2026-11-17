import { atrSeries, emaSeries, rsiSeries, round2 } from "./indicators";
import { indexAllows } from "./index-filter";
import type { Signal, SignalContext, StrategyDef } from "./types";

/**
 * Live RS Resilience entry, from scanner/rs_scanner.py, including the Nifty
 * regime gate (10-day return under 1%). The exit is the live chandelier:
 * highest close since entry minus 2.5 times ATR(14), and it only moves up.
 * The scanner's own target and stop are not used.
 * RSI is the scanner's exponential average, not a simple 14-day mean.
 */
export const rsResilience: StrategyDef = {
  name: "rs",
  book: "swing",
  params: {
    outperform: { default: 5, grid: [4, 5, 7] },
    /** 0 keeps new buys free of this average. Open positions are not closed by it. */
    indexDays: { default: 0, grid: [100, 150, 200] },
    /** 1 switches the trail from 2.5 ATR to 1.5 ATR once the close is 10% above the fill. */
    tight: { default: 0, grid: [] },
    /** Above 0, sell half at the next open once the close reaches this many R. */
    halfR: { default: 0, grid: [] },
  },
  signals(ctx) {
    const closes = ctx.bars.map((bar) => bar.c);
    const ema50 = cached(ctx, "ema50", () => emaSeries(closes, 50));
    const rsi = cached(ctx, "rsi14", () => rsiSeries(closes, 14));
    const atr = cached(ctx, "atr14", () => atrSeries(ctx.bars, 14));
    const mansfield = cached(ctx, "mansfield", () => mansfieldSeries(closes, ctx.indexClose, 20));
    const out: Signal[] = [];
    for (let i = 80; i < ctx.bars.length - 1; i++) {
      const indexNow = ctx.indexClose[i];
      const indexThen = ctx.indexClose[i - 10];
      if (!Number.isFinite(indexNow) || !Number.isFinite(indexThen) || indexThen === 0 || closes[i - 10] === 0) continue;
      const niftyRet = (indexNow - indexThen) / indexThen;
      if (niftyRet >= 0.01) continue;
      const stockRet = ((closes[i] - closes[i - 10]) / closes[i - 10]) * 100;
      const indexPct = niftyRet * 100;
      const edge = stockRet - indexPct;
      if (edge < ctx.params.outperform) continue;
      const now = mansfield[i];
      const past = mansfield[i - 5];
      if (!Number.isFinite(now) || !Number.isFinite(past) || now <= past) continue;
      if (!Number.isFinite(ema50[i]) || closes[i] <= ema50[i]) continue;
      const reading = round2(rsi[i]);
      if (!Number.isFinite(reading) || reading < 45 || reading > 65) continue;
      let lowNow = ctx.bars[i].l;
      for (let k = i - 9; k <= i; k++) if (ctx.bars[k].l < lowNow) lowNow = ctx.bars[k].l;
      let lowBack = ctx.bars[i - 20].l;
      for (let k = i - 29; k <= i - 20; k++) if (k >= 0 && ctx.bars[k].l < lowBack) lowBack = ctx.bars[k].l;
      if (lowNow <= lowBack) continue;
      if (!indexAllows(ctx.indexClose, i, ctx.params.indexDays ?? 0)) continue;
      if (!Number.isFinite(atr[i]) || atr[i] <= 0) continue;
      const stop = closes[i] - 2.5 * atr[i];
      if (!(stop > 0) || stop >= closes[i]) continue;
      out.push({ at: i, side: "long", score: edge, stop, useLimit: true });
    }
    return out;
  },
  afterClose(ctx, i) {
    const atr = cached(ctx, "atr14", () => atrSeries(ctx.bars, 14));
    if (!Number.isFinite(atr[i])) return { exit: false, stop: ctx.stop };
    let highest = ctx.bars[ctx.entryAt].c;
    for (let k = ctx.entryAt; k <= i; k++) if (ctx.bars[k].c > highest) highest = ctx.bars[k].c;
    const gained = (ctx.entryPx ?? 0) > 0 && ctx.bars[i].c >= (ctx.entryPx ?? 0) * 1.1;
    const mult = (ctx.params.tight ?? 0) > 0 && gained ? 1.5 : 2.5;
    const raw = highest - mult * atr[i];
    const stop = Math.max(ctx.stop, raw);
    return { exit: ctx.bars[i].c < stop, stop };
  },
};

function cached(ctx: SignalContext, key: string, build: () => number[]): number[] {
  const cache = ctx.cache ?? (ctx.cache = new Map());
  const hit = cache.get(key);
  if (Array.isArray(hit)) return hit as number[];
  const built = build();
  cache.set(key, built);
  return built;
}

function mansfieldSeries(stock: readonly number[], index: Float64Array, period: number): number[] {
  const ratio: number[] = [];
  for (let i = 0; i < stock.length; i++) {
    const base = index[i];
    ratio.push(Number.isFinite(base) && base > 0 ? stock[i] / base : Number.NaN);
  }
  const alpha = 2 / (period + 1);
  const out: number[] = [];
  let acc = 0;
  let started = false;
  for (const value of ratio) {
    if (!Number.isFinite(value)) {
      out.push(Number.NaN);
      continue;
    }
    if (!started) {
      acc = value;
      started = true;
    } else {
      acc = (1 - alpha) * acc + alpha * value;
    }
    out.push(acc);
  }
  return out;
}
