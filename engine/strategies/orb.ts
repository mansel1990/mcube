import { atr, type Bar, type ClosedTrade } from "./math";

/** Opening-range breakout on intraday bars. Flat on the last bar of each session. */
export function orb(bars: Bar[], rangeBars: number): ClosedTrade[] {
  const trades: ClosedTrade[] = [];
  const days = new Map<string, Bar[]>();
  for (const bar of bars) {
    const day = bar.t.slice(0, 10);
    const list = days.get(day) ?? [];
    list.push(bar);
    days.set(day, list);
  }
  for (const day of days.values()) {
    if (day.length <= rangeBars + 1) continue;
    const opening = day.slice(0, rangeBars);
    const high = Math.max(...opening.map((bar) => bar.h));
    const low = Math.min(...opening.map((bar) => bar.l));
    const firstUp = opening[0].c >= opening[0].o;
    const stopDist = atr(day, rangeBars, Math.min(14, rangeBars)) ?? (high - low);
    let side: "long" | "short" | null = null;
    let entry = 0;
    let entryT = "";
    for (let i = rangeBars; i < day.length - 1; i++) {
      if (!side && firstUp && day[i].h > high) {
        side = "long";
        entry = high;
        entryT = day[i].t;
      } else if (!side && !firstUp && day[i].l < low) {
        side = "short";
        entry = low;
        entryT = day[i].t;
      }
      if (!side) continue;
      const stop = side === "long" ? entry - stopDist : entry + stopDist;
      const stopped = side === "long" ? day[i].l <= stop : day[i].h >= stop;
      if (stopped || i === day.length - 2) {
        const exitPx = stopped ? stop : day[day.length - 1].c;
        trades.push({ entry: entryT, exit: day[Math.min(i + 1, day.length - 1)].t, side, entryPx: entry, exitPx });
        break;
      }
    }
  }
  return trades;
}
