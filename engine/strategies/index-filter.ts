/** True when the filter is off, or the index close is above its own N-day average. */
export function indexAllows(closes: ArrayLike<number>, i: number, days: number): boolean {
  if (!(days > 0)) return true;
  if (i < days - 1) return false;
  let sum = 0;
  for (let k = i - days + 1; k <= i; k++) {
    const close = closes[k];
    if (!Number.isFinite(close)) return false;
    sum += close;
  }
  return closes[i] > sum / days;
}
