import type { SignalSource, UnifiedSignal } from "./types";
import { normalizeDateStr } from "./format-date";

function dateStr(d: unknown): string {
  return normalizeDateStr(d);
}

export interface ManishRow {
  id: number;
  signal_date: string;
  ticker: string;
  peers: string | null;
  entry_z: string | null;
  peer_slope_pct: string | null;
  entry_date: string | null;
  entry_price: string | null;
  status: string;
  exit_date: string | null;
  exit_price: string | null;
  pnl_pct: string | null;
  hold_days: number;
  exit_reason: string | null;
}

export interface SwingRow {
  id: number;
  date: string;
  symbol: string;
  cmp: number;
  entry_min: number;
  entry_max: number;
  target: number;
  stop_loss: number;
  volume_ratio: number;
  rsi: number;
  signal_strength: string;
}

export function mapManish(row: ManishRow): UnifiedSignal {
  const isOpen = row.status === "OPEN";
  return {
    id: `manish-${row.id}`,
    source: "manish",
    ticker: row.ticker,
    status: isOpen ? "open" : "closed",
    signalDate: dateStr(row.signal_date),
    entryDate: row.entry_date ? dateStr(row.entry_date) : null,
    entryPrice: row.entry_price ? parseFloat(row.entry_price) : null,
    entryMin: row.entry_price ? parseFloat(row.entry_price) : null,
    entryMax: row.entry_price ? parseFloat(row.entry_price) : null,
    target: null,
    stopLoss: null,
    cmp: null,
    rsi: null,
    volumeRatio: null,
    signalStrength: null,
    exitDate: row.exit_date ? dateStr(row.exit_date) : null,
    exitPrice: row.exit_price ? parseFloat(row.exit_price) : null,
    realizedPnlPct: row.pnl_pct ? parseFloat(row.pnl_pct) : null,
    exitReason: row.exit_reason,
    holdDays: row.hold_days ?? 0,
    peers: row.peers ? row.peers.split(",").map((p) => p.trim()).filter(Boolean) : null,
    entryZ: row.entry_z ? parseFloat(row.entry_z) : null,
    peerSlopePct: row.peer_slope_pct ? parseFloat(row.peer_slope_pct) : null,
  };
}

export function mapSwing(row: SwingRow, source: SignalSource): UnifiedSignal {
  return {
    id: `${source}-${row.id}`,
    source,
    ticker: row.symbol,
    status: "open",
    signalDate: dateStr(row.date),
    entryDate: null,
    entryPrice: null,
    entryMin: Number(row.entry_min),
    entryMax: Number(row.entry_max),
    target: Number(row.target),
    stopLoss: Number(row.stop_loss),
    cmp: Number(row.cmp),
    rsi: Number(row.rsi),
    volumeRatio: Number(row.volume_ratio),
    signalStrength: row.signal_strength,
    exitDate: null,
    exitPrice: null,
    realizedPnlPct: null,
    exitReason: null,
    holdDays: 0,
    peers: null,
    entryZ: null,
    peerSlopePct: null,
  };
}

export function suggestedEntry(signal: UnifiedSignal): number | null {
  if (signal.entryPrice != null) return signal.entryPrice;
  if (signal.entryMin != null && signal.entryMax != null) {
    return (signal.entryMin + signal.entryMax) / 2;
  }
  if (signal.entryMin != null) return signal.entryMin;
  if (signal.cmp != null) return signal.cmp;
  return null;
}
