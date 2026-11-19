import { researchThresholds, type ResearchBook, type ResearchSample, type ResearchThresholds } from "./research-bar";

export type ResearchTile = {
  id: string;
  label: string;
  value: string;
  requirement: string;
  passed: boolean;
};

export type TileMetrics = {
  profitFactor: number | null;
  trades: number | null;
  halfYearsPct: number | null;
  worstDrawdownPct: number | null;
  avgNetPct: number | null;
};

function num(value: number | null, digits: number): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

/** Score a run with the threshold for that run's own sample. */
export function researchTiles(metrics: TileMetrics, bar: ResearchThresholds): ResearchTile[] {
  return [
    {
      id: "profit-factor",
      label: "Profit factor",
      value: num(metrics.profitFactor, 2),
      requirement: `Needs ${bar.profitFactor.toFixed(2)}`,
      passed: metrics.profitFactor != null && metrics.profitFactor >= bar.profitFactor,
    },
    {
      id: "trade-count",
      label: "Trade count",
      value: metrics.trades == null ? "—" : String(metrics.trades),
      requirement: `Needs ${bar.trades}`,
      passed: metrics.trades != null && metrics.trades >= bar.trades,
    },
    {
      id: "half-years",
      label: "Profitable half-years",
      value: metrics.halfYearsPct == null ? "—" : `${num(metrics.halfYearsPct, 0)}%`,
      requirement: `Needs ${bar.halfYearsPct}%`,
      passed: metrics.halfYearsPct != null && metrics.halfYearsPct >= bar.halfYearsPct,
    },
    {
      id: "worst-fall",
      label: "Worst fall",
      value: metrics.worstDrawdownPct == null ? "—" : `${num(metrics.worstDrawdownPct, 1)}%`,
      requirement: `Needs ≤ ${bar.maxDrawdownPct}%`,
      passed: metrics.worstDrawdownPct != null && metrics.worstDrawdownPct <= bar.maxDrawdownPct,
    },
    {
      id: "average-net",
      label: "Average net per trade",
      value: metrics.avgNetPct == null ? "—" : `${num(metrics.avgNetPct, 2)}%`,
      requirement: `Needs ${bar.avgNetPct}%`,
      passed: metrics.avgNetPct != null && metrics.avgNetPct >= bar.avgNetPct,
    },
  ];
}

export function tilesForSample(metrics: TileMetrics, book: ResearchBook, sample: ResearchSample): ResearchTile[] {
  return researchTiles(metrics, researchThresholds(book, sample));
}

export function passedCount(tiles: readonly ResearchTile[]): number {
  return tiles.filter((tile) => tile.passed).length;
}
