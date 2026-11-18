/** One reader for the Intraday retirement flag. Missing or false keeps the existing book. */
export function intradayRetired(value: unknown): boolean {
  return value === true || value === "true";
}

export type IntradayRetiredMetric = {
  runId: number;
  sample: string;
  strategy: string;
  profitFactor: number;
  trades: number;
};

const ORB_PF = 0.71;
const ORB_TRADES = 710;
const VWAP_PF = 0.34;
const VWAP_TRADES = 1342;

function matches(value: number, expected: number): boolean {
  return Math.round(value * 100) / 100 === expected;
}

/**
 * The retired sentence is shown only when a stored building run has both
 * published metrics. The run id is that row's id. No run is created here.
 */
export function intradayRetiredSentence(rows: readonly IntradayRetiredMetric[]): string | null {
  const byRun = new Map<number, IntradayRetiredMetric[]>();
  for (const row of rows) {
    if (row.sample !== "building") continue;
    const list = byRun.get(row.runId) ?? [];
    list.push(row);
    byRun.set(row.runId, list);
  }
  const runIds = [...byRun.keys()].sort((a, b) => b - a);
  for (const runId of runIds) {
    const list = byRun.get(runId) ?? [];
    const orb = list.find((row) => row.strategy === "orb");
    const vwap = list.find((row) => row.strategy === "vwap");
    if (!orb || !vwap) continue;
    if (matches(orb.profitFactor, ORB_PF) && orb.trades === ORB_TRADES && matches(vwap.profitFactor, VWAP_PF) && vwap.trades === VWAP_TRADES) {
      return `Intraday (ORB, VWAP), retired 18 Nov 2026. Failed the full building test: ORB PF 0.71 over 710 trades, VWAP PF 0.34 over 1,342 trades (run ${runId}).`;
    }
  }
  return null;
}
