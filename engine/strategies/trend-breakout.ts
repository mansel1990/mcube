import { sma, type Bar, type ClosedTrade } from "./math";

/** Minervini-style breakout. A signal uses only bars closed before the entry day. */
export function trendBreakout(bars: Bar[], strong: boolean[]): ClosedTrade[] {
  const closes = bars.map((bar) => bar.c);
  const trades: ClosedTrade[] = [];
  let open: { i: number } | null = null;
  for (let i = 252; i < bars.length - 1; i++) {
    if (open) {
      const avg = sma(closes, i, 21);
      if (avg != null && bars[i].c < avg) {
        trades.push({ entry: bars[open.i].t, exit: bars[i + 1].t, side: "long", entryPx: bars[open.i].o, exitPx: bars[i + 1].o });
        open = null;
      }
      continue;
    }
    const high52 = Math.max(...bars.slice(i - 251, i + 1).map((bar) => bar.h));
    const avg50 = sma(closes, i, 50);
    const avg150 = sma(closes, i, 150);
    const avg200 = sma(closes, i, 200);
    const avgVol = sma(bars.map((bar) => bar.v), i, 20);
    const priorHigh = Math.max(...bars.slice(i - 20, i).map((bar) => bar.h));
    if (avg50 == null || avg150 == null || avg200 == null || avgVol == null) continue;
    const nearHigh = bars[i].c >= high52 * 0.75 && bars[i].c <= high52;
    const stacked = bars[i].c > avg50 && avg50 > avg150 && avg150 > avg200;
    const breakout = bars[i].c > priorHigh && bars[i].v >= avgVol * 1.5;
    if (nearHigh && stacked && breakout && strong[i]) open = { i: i + 1 };
  }
  return trades;
}
