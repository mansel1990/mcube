/** Percentile ranks for one calendar. 1 is the best value that day. */
export function percentileRanks(values: Float64Array[]): { rank: Float64Array[]; n: Float64Array } {
  const days = values[0]?.length ?? 0;
  const symbols = values.length;
  const rank = values.map(() => {
    const row = new Float64Array(days);
    row.fill(Number.NaN);
    return row;
  });
  const n = new Float64Array(days);
  const order: number[] = [];
  for (let day = 0; day < days; day++) {
    order.length = 0;
    for (let symbol = 0; symbol < symbols; symbol++) {
      if (Number.isFinite(values[symbol][day])) order.push(symbol);
    }
    n[day] = order.length;
    if (order.length < 2) continue;
    order.sort((a, b) => values[a][day] - values[b][day]);
    let cursor = 0;
    while (cursor < order.length) {
      let end = cursor;
      const value = values[order[cursor]][day];
      while (end + 1 < order.length && values[order[end + 1]][day] === value) end += 1;
      const better = order.length - 1 - end;
      const pct = (order.length - 1 - better) / (order.length - 1);
      for (let i = cursor; i <= end; i++) rank[order[i]][day] = pct;
      cursor = end + 1;
    }
  }
  return { rank, n };
}

export function returns90(closes: Float64Array): Float64Array {
  const out = new Float64Array(closes.length);
  out.fill(Number.NaN);
  for (let i = 90; i < closes.length; i++) {
    const base = closes[i - 90];
    const last = closes[i];
    if (base > 0 && Number.isFinite(last)) out[i] = last / base - 1;
  }
  return out;
}
