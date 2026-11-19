export type DayValue = { date: string; value: number };
export type CashFlow = { date: string; deposit: number; withdrawal: number };
export type NiftyClose = { date: string; close: number };

export type BenchmarkSlice = {
  oursPct: number | null;
  niftyPct: number | null;
  diffPp: number | null;
  gainInr: number | null;
  daysAhead: number;
  marketDays: number;
};

export type DayStep = { date: string; ours: number; nifty: number };

/**
 * Time-weighted return against Nifty's close-to-close change.
 * A day with no Nifty close is skipped for both. Deposits are not profit.
 */
export function benchmarkSlice(values: DayValue[], flows: CashFlow[], closes: NiftyClose[]): BenchmarkSlice {
  const steps = pairedSteps(values, flows, closes);
  const gainInr = flowGain(values, flows);
  if (steps.length === 0) return { oursPct: null, niftyPct: null, diffPp: null, gainInr, daysAhead: 0, marketDays: 0 };
  let ours = 1;
  let nifty = 1;
  let ahead = 0;
  for (const step of steps) {
    ours *= 1 + step.ours;
    nifty *= 1 + step.nifty;
    if (step.ours > step.nifty) ahead += 1;
  }
  const oursPct = (ours - 1) * 100;
  const niftyPct = (nifty - 1) * 100;
  return {
    oursPct,
    niftyPct,
    diffPp: oursPct - niftyPct,
    gainInr,
    daysAhead: ahead,
    marketDays: steps.length,
  };
}

/** Rupee change after deposits and withdrawals. A deposit is not a gain. */
export function flowGain(values: DayValue[], flows: CashFlow[]): number | null {
  const ordered = [...values].filter((row) => row.value > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 2) return null;
  const start = ordered[0];
  const end = ordered[ordered.length - 1];
  let deposits = 0;
  let withdrawals = 0;
  for (const flow of flows) {
    if (flow.date <= start.date || flow.date > end.date) continue;
    deposits += flow.deposit;
    withdrawals += flow.withdrawal;
  }
  return end.value - start.value - deposits + withdrawals;
}

export function pairedSteps(values: DayValue[], flows: CashFlow[], closes: NiftyClose[]): DayStep[] {
  const value = new Map(values.map((row) => [row.date, row.value]));
  const flow = new Map(flows.map((row) => [row.date, row]));
  const close = new Map(closes.map((row) => [row.date, row.close]));
  const dates = [...value.keys()].filter((date) => close.has(date) && (value.get(date) ?? 0) > 0).sort();
  const steps: DayStep[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const prev = dates[i - 1];
    const day = dates[i];
    const prevValue = value.get(prev) ?? 0;
    const nextValue = value.get(day) ?? 0;
    const prevClose = close.get(prev) ?? 0;
    const nextClose = close.get(day) ?? 0;
    if (!(prevValue > 0) || !(prevClose > 0)) continue;
    const moved = flow.get(day);
    const deposit = moved?.deposit ?? 0;
    const withdrawal = moved?.withdrawal ?? 0;
    steps.push({
      date: day,
      ours: (nextValue - prevValue - deposit + withdrawal) / prevValue,
      nifty: nextClose / prevClose - 1,
    });
  }
  return steps;
}

/** Nifty rebased to our account value on the first shared day. */
export function rebaseNifty(account: DayValue[], closes: NiftyClose[]): { date: string; value: number }[] {
  const close = new Map(closes.map((row) => [row.date, row.close]));
  const shared = account.filter((row) => (close.get(row.date) ?? 0) > 0);
  const first = shared[0];
  if (!first) return [];
  const baseClose = close.get(first.date) ?? 0;
  if (!(baseClose > 0)) return [];
  return shared.map((row) => ({
    date: row.date,
    value: first.value * ((close.get(row.date) ?? baseClose) / baseClose),
  }));
}

/** Last close the benchmark can use. The card is end-of-day, so this is not today's live mark. */
export function benchmarkThrough(values: DayValue[], closes: NiftyClose[]): string | null {
  const lastValue = values.length ? values[values.length - 1].date : null;
  const lastClose = closes.length ? closes[closes.length - 1].date : null;
  if (!lastValue) return lastClose;
  if (!lastClose) return lastValue;
  return lastValue < lastClose ? lastValue : lastClose;
}

export function sliceWindow(values: DayValue[], flows: CashFlow[], closes: NiftyClose[], from: string | null): BenchmarkSlice {
  if (!from) return benchmarkSlice(values, flows, closes);
  const anchor = [...values].reverse().find((row) => row.date < from);
  const anchorClose = [...closes].reverse().find((row) => row.date < from);
  return benchmarkSlice(
    [...(anchor ? [anchor] : []), ...values.filter((row) => row.date >= from)],
    flows.filter((row) => row.date >= from),
    [...(anchorClose ? [anchorClose] : []), ...closes.filter((row) => row.date >= from)],
  );
}
