export type Bar = { t: string; o: number; h: number; l: number; c: number; v: number };

export type Side = "long" | "short";

export type ClosedTrade = {
  entry: string;
  exit: string;
  side: Side;
  entryPx: number;
  exitPx: number;
};

export function sma(values: number[], end: number, length: number): number | null {
  if (end + 1 < length) return null;
  let sum = 0;
  for (let i = end - length + 1; i <= end; i++) sum += values[i];
  return sum / length;
}

export function rsi(closes: number[], end: number, length: number): number | null {
  if (end < length) return null;
  let gain = 0;
  let loss = 0;
  for (let i = end - length + 1; i <= end; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }
  if (loss === 0) return 100;
  const rs = gain / length / (loss / length);
  return 100 - 100 / (1 + rs);
}

export function atr(bars: Bar[], end: number, length: number): number | null {
  if (end < length) return null;
  let sum = 0;
  for (let i = end - length + 1; i <= end; i++) {
    const prev = bars[i - 1]?.c ?? bars[i].o;
    const range = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prev), Math.abs(bars[i].l - prev));
    sum += range;
  }
  return sum / length;
}

export function slope(closes: number[], end: number, length: number): number | null {
  if (end + 1 < length) return null;
  const start = end - length + 1;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < length; i++) {
    const y = closes[start + i];
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const denom = length * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (length * sumXY - sumX * sumY) / denom;
}
