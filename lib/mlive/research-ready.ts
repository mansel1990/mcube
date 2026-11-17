export type SamplePass = { strategy: string; sample: string; passed: boolean };

/**
 * How many intraday strategies have passed.
 * A strategy counts when the default row of its latest ok run passed on both samples.
 * Pass the rows already reduced to one row per strategy and sample, newest first.
 */
export function passedIntradayStrategies(rows: SamplePass[]): number {
  const byStrategy = new Map<string, { building?: boolean; heldback?: boolean }>();
  for (const row of rows) {
    if (row.sample !== "building" && row.sample !== "heldback") continue;
    const bag = byStrategy.get(row.strategy) ?? {};
    if (bag[row.sample] === undefined) bag[row.sample] = row.passed === true;
    byStrategy.set(row.strategy, bag);
  }
  let ready = 0;
  for (const bag of byStrategy.values()) {
    if (bag.building === true && bag.heldback === true) ready += 1;
  }
  return ready;
}
