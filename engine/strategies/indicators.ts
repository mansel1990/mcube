import { sma, type Bar } from "./math";

/** pandas `ewm(span=period, adjust=False)`. Value at i uses only values at or before i. */
export function emaSeries(values: readonly number[], period: number): number[] {
  const out: number[] = [];
  if (period < 1) return values.map(() => Number.NaN);
  const alpha = 2 / (period + 1);
  let acc = 0;
  let started = false;
  for (const value of values) {
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

/** pandas `ewm(com=period-1, adjust=False)` on the up/down changes. Causal. */
export function rsiSeries(closes: readonly number[], period: number): number[] {
  const out = closes.map(() => Number.NaN);
  if (period < 1 || closes.length <= period) return out;
  const alpha = 1 / period;
  let avgGain = 0;
  let avgLoss = 0;
  let seeded = false;
  let count = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    count += 1;
    if (!seeded) {
      avgGain = gain;
      avgLoss = loss;
      seeded = true;
    } else {
      avgGain = (1 - alpha) * avgGain + alpha * gain;
      avgLoss = (1 - alpha) * avgLoss + alpha * loss;
    }
    if (count < period) continue;
    if (avgLoss === 0) out[i] = 100;
    else out[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atrSeries(bars: readonly Bar[], period: number): number[] {
  const out = bars.map(() => Number.NaN);
  if (period < 1) return out;
  let sum = 0;
  const window: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].c;
    const range = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prev), Math.abs(bars[i].l - prev));
    window.push(range);
    sum += range;
    if (window.length > period) sum -= window.shift() ?? 0;
    if (window.length === period) out[i] = sum / period;
  }
  return out;
}

export function smaAt(values: readonly number[], end: number, length: number): number | null {
  return sma(values as number[], end, length);
}

export function weekdayUtc(day: string): number {
  return new Date(`${day.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
