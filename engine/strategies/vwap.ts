import type { Bar, ClosedTrade } from "./math";

/** VWAP trend. Long above the session VWAP, short below, flat on the last bar. At most a few flips a day. */
export function vwapTrend(bars: Bar[]): ClosedTrade[] {
  const trades: ClosedTrade[] = [];
  const days = new Map<string, Bar[]>();
  for (const bar of bars) {
    const day = bar.t.slice(0, 10);
    const list = days.get(day) ?? [];
    list.push(bar);
    days.set(day, list);
  }
  for (const day of days.values()) {
    let pv = 0;
    let vol = 0;
    let side: "long" | "short" | null = null;
    let entry = 0;
    let entryT = "";
    let flips = 0;
    for (let i = 0; i < day.length; i++) {
      const typical = (day[i].h + day[i].l + day[i].c) / 3;
      pv += typical * day[i].v;
      vol += day[i].v;
      const vwap = vol > 0 ? pv / vol : day[i].c;
      const next: "long" | "short" = day[i].c >= vwap ? "long" : "short";
      const last = i === day.length - 1;
      if (side && (next !== side || last || flips >= 3)) {
        trades.push({ entry: entryT, exit: day[i].t, side, entryPx: entry, exitPx: day[i].c });
        side = null;
        if (last || flips >= 3) continue;
      }
      if (!side && !last) {
        side = next;
        entry = day[i].c;
        entryT = day[i].t;
        flips += 1;
      }
    }
  }
  return trades;
}
