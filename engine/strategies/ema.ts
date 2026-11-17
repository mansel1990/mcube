import { emaSeries, rsiSeries, round2 } from "./indicators";
import type { Signal, SignalContext, StrategyDef } from "./types";

/**
 * Live EMA Pullback. Filters match scanner/ema_scanner.py.
 * The buy is the live 09:45 limit at the signal close plus the limit offset,
 * not the scanner's fill at the 20 EMA and not the next open.
 * The exit is the live one: the stop is the 20-day EMA and only moves up.
 * A close under it sells at the next open. The scanner's target is not used.
 */
export const emaPullback: StrategyDef = {
  name: "ema",
  book: "swing",
  params: {
    tolerance: { default: 0.02, grid: [0.015, 0.02, 0.025] },
  },
  signals(ctx) {
    const closes = ctx.bars.map((bar) => bar.c);
    const ema20 = series(ctx, "ema20", () => emaSeries(closes, 20));
    const ema50 = series(ctx, "ema50", () => emaSeries(closes, 50));
    const rsi = series(ctx, "rsi14", () => rsiSeries(closes, 14));
    const out: Signal[] = [];
    const lookback = 5;
    for (let i = 65; i < ctx.bars.length - 1; i++) {
      const fast = ema20[i];
      const slow = ema50[i];
      const value = rsi[i];
      if (!Number.isFinite(fast) || !Number.isFinite(slow) || !Number.isFinite(value) || !(fast > 0)) continue;
      const close = closes[i];
      if (fast <= slow) continue;
      if (close > slow * 1.15) continue;
      if (close <= fast) continue;
      if (fast * 1.04 < close * 1.02) continue;
      let touched = false;
      for (let j = i - lookback; j < i; j++) {
        if (j < 0 || !Number.isFinite(ema20[j]) || ema20[j] === 0) continue;
        if (Math.abs(closes[j] - ema20[j]) / ema20[j] <= ctx.params.tolerance) touched = true;
      }
      if (!touched) continue;
      const reading = round2(value);
      if (reading < 40 || reading > 62) continue;
      let volume = 0;
      let counted = 0;
      for (let j = i - 20; j < i; j++) {
        if (j < 0) continue;
        volume += ctx.bars[j].v;
        counted += 1;
      }
      if (counted === 0 || volume <= 0) continue;
      const ratio = ctx.bars[i].v / (volume / counted);
      out.push({ at: i, side: "long", score: ratio, stop: fast, minEntry: fast, useLimit: true });
    }
    return out;
  },
  afterClose(ctx, i) {
    const ema20 = series(ctx, "ema20", () => emaSeries(ctx.bars.map((bar) => bar.c), 20));
    const value = ema20[i];
    if (!Number.isFinite(value)) return { exit: false, stop: ctx.stop };
    const stop = Math.max(ctx.stop, value);
    return { exit: ctx.bars[i].c < stop, stop };
  },
};

function series(ctx: SignalContext, key: string, build: () => number[]): number[] {
  const cache = ctx.cache ?? (ctx.cache = new Map());
  const hit = cache.get(key);
  if (Array.isArray(hit)) return hit as number[];
  const built = build();
  cache.set(key, built);
  return built;
}
