import { rsi, sma, type Bar, type ClosedTrade } from "./math";

/** Connors RSI(2). Entry is the next bar's open. Exit is a close above the 5-day average, or 10 days. */
export function rsi2(bars: Bar[]): ClosedTrade[] {
  const closes = bars.map((bar) => bar.c);
  const trades: ClosedTrade[] = [];
  let open: { i: number } | null = null;
  for (let i = 200; i < bars.length - 1; i++) {
    if (open) {
      const held = i - open.i;
      const avg5 = sma(closes, i, 5);
      if (held >= 10 || (avg5 != null && bars[i].c > avg5)) {
        trades.push({ entry: bars[open.i].t, exit: bars[i + 1].t, side: "long", entryPx: bars[open.i].o, exitPx: bars[i + 1].o });
        open = null;
      }
      continue;
    }
    const avg200 = sma(closes, i, 200);
    const value = rsi(closes, i, 2);
    if (avg200 != null && value != null && bars[i].c > avg200 && value < 10) open = { i: i + 1 };
  }
  return trades;
}
