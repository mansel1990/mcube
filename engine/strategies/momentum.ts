import { sma, slope, type Bar, type ClosedTrade } from "./math";

/**
 * Weekly momentum. `held` is true on bars where this symbol is in the top slice
 * and the index is above its 200-day average. The caller builds that mask.
 */
export function momentum(bars: Bar[], held: boolean[]): ClosedTrade[] {
  const closes = bars.map((bar) => bar.c);
  const trades: ClosedTrade[] = [];
  let open: { i: number } | null = null;
  for (let i = 200; i < bars.length - 1; i++) {
    const weekday = new Date(`${bars[i].t}T00:00:00Z`).getUTCDay();
    const rebalance = weekday === 5 || i === bars.length - 2;
    if (!rebalance) continue;
    const indexOk = sma(closes, i, 200) != null;
    const strength = slope(closes, i, 90);
    if (open && (!held[i] || !indexOk || strength == null)) {
      trades.push({ entry: bars[open.i].t, exit: bars[i + 1].t, side: "long", entryPx: bars[open.i].o, exitPx: bars[i + 1].o });
      open = null;
    }
    if (!open && held[i] && strength != null && strength > 0) open = { i: i + 1 };
  }
  return trades;
}
