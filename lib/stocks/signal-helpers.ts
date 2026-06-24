import { sql } from "@/lib/sql";
import { mapManish, mapSwing, type ManishRow, type SwingRow } from "./signal-mappers";
import type { SignalSource, UnifiedSignal } from "./types";
import { normalizeDateStr } from "./format-date";

export async function fetchManishSuggestions(): Promise<UnifiedSignal[]> {
  const rows = await sql`
    SELECT
      id, signal_date, ticker, peers,
      entry_z, peer_slope_pct,
      entry_date, entry_price,
      status, exit_date, exit_price,
      pnl_pct, hold_days, exit_reason
    FROM sim.stock_suggestions
    ORDER BY signal_date DESC
  `;
  return (rows as ManishRow[]).map(mapManish);
}

async function fetchSwingSource(source: Exclude<SignalSource, "manish">): Promise<UnifiedSignal[]> {
  let rows: SwingRow[] = [];

  switch (source) {
    case "breakout":
      rows = await sql`SELECT * FROM swing.breakout_signals WHERE date = (SELECT MAX(date) FROM swing.breakout_signals) ORDER BY volume_ratio DESC` as SwingRow[];
      break;
    case "ema_pullback":
      rows = await sql`SELECT * FROM swing.ema_signals WHERE date = (SELECT MAX(date) FROM swing.ema_signals) ORDER BY volume_ratio DESC` as SwingRow[];
      break;
    case "vcp":
      rows = await sql`SELECT * FROM swing.vcp_signals WHERE date = (SELECT MAX(date) FROM swing.vcp_signals) ORDER BY volume_ratio DESC` as SwingRow[];
      break;
    case "rs_resilience":
      rows = await sql`SELECT * FROM swing.rs_signals WHERE date = (SELECT MAX(date) FROM swing.rs_signals) ORDER BY volume_ratio DESC` as SwingRow[];
      break;
    case "mean_reversion":
      rows = await sql`SELECT * FROM swing.mean_reversion_signals WHERE date = (SELECT MAX(date) FROM swing.mean_reversion_signals) ORDER BY volume_ratio DESC` as SwingRow[];
      break;
    case "fib_pullback":
      rows = await sql`SELECT * FROM swing.fib_signals WHERE date = (SELECT MAX(date) FROM swing.fib_signals) ORDER BY volume_ratio DESC` as SwingRow[];
      break;
    case "fear_reversion":
      rows = await sql`SELECT * FROM swing.fear_reversion_signals WHERE date = (SELECT MAX(date) FROM swing.fear_reversion_signals) ORDER BY volume_ratio DESC` as SwingRow[];
      break;
  }

  return rows.map((r) => mapSwing(r, source));
}

export async function fetchAllSignalsBySource(): Promise<Record<SignalSource, UnifiedSignal[]>> {
  const [
    manish,
    breakout,
    ema_pullback,
    vcp,
    rs_resilience,
    mean_reversion,
    fib_pullback,
    fear_reversion,
  ] = await Promise.all([
    fetchManishSuggestions(),
    fetchSwingSource("breakout"),
    fetchSwingSource("ema_pullback"),
    fetchSwingSource("vcp"),
    fetchSwingSource("rs_resilience"),
    fetchSwingSource("mean_reversion"),
    fetchSwingSource("fib_pullback"),
    fetchSwingSource("fear_reversion"),
  ]);

  // ML strategies are served separately from daily_suggestor.trades
  // (see /api/stocks/ml/signals) — empty here so the record stays total.
  return {
    manish,
    breakout,
    ema_pullback,
    vcp,
    rs_resilience,
    mean_reversion,
    fib_pullback,
    fear_reversion,
    s05_garch_volume: [],
    s07_wavelet_volume: [],
    sanjay_xgb_b8: [],
    s08_gap_momentum: [],
    s06_tcn_ohlcv: [],
    s11_cluster_meanrev: [],
  };
}

export async function fetchAllOpenSignals(): Promise<UnifiedSignal[]> {
  const bySource = await fetchAllSignalsBySource();
  return Object.values(bySource).flatMap((signals) =>
    signals.filter((s) => s.status === "open")
  );
}

export function getLastScanDate(signals: UnifiedSignal[]): string | null {
  const open = signals.filter((s) => s.status === "open");
  if (!open.length) return null;
  const dates = open.map((s) => normalizeDateStr(s.signalDate)).filter(Boolean);
  if (!dates.length) return null;
  return dates.reduce((max, d) => (d > max ? d : max), dates[0]);
}

export function filterFreshOpenSignals(signals: UnifiedSignal[]): UnifiedSignal[] {
  const open = signals.filter((s) => s.status === "open");
  const lastScan = getLastScanDate(open);
  if (!lastScan) return [];
  return open.filter((s) => normalizeDateStr(s.signalDate) === lastScan);
}

