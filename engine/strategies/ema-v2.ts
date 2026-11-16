import { sma, type Bar, type ClosedTrade } from "./math";

/** EMA pullback baseline. Entry is the next session's open, which stands in for the live price after the open. */
export function emaV2(bars: Bar[]): ClosedTrade[] {
  const closes = bars.map((bar) => bar.c);
  const trades: ClosedTrade[] = [];
  let open: { i: number } | null = null;
  for (let i = 50; i < bars.length - 1; i++) {
    if (open) {
      const avg = sma(closes, i, 20);
      if (avg != null && bars[i].c < avg) {
        trades.push({ entry: bars[open.i].t, exit: bars[i + 1].t, side: "long", entryPx: bars[open.i].o, exitPx: bars[i + 1].o });
        open = null;
      }
      continue;
    }
    const avg20 = sma(closes, i, 20);
    const avg50 = sma(closes, i, 50);
    if (avg20 == null || avg50 == null) continue;
    const pullback = bars[i].l <= avg20 && bars[i].c > avg20 && bars[i].c > avg50;
    if (pullback) open = { i: i + 1 };
  }
  return trades;
}
