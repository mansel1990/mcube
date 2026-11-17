import { lossDayOverlap, overlapNote } from "@/lib/mlive/research-bar";
import type { RangeAudit } from "./clean";
import type { StoredTradeRef } from "./data";
import type { ScoredRun } from "./score";

const FROZEN_LABELS: Record<string, string> = {
  rs: "RS (a)",
  momentum: "Momentum (a)",
  trend_breakout: "Trend breakout",
  "rs+momentum": "RS (a) + Momentum (a)",
  "trend_breakout+momentum": "Trend breakout + Momentum (a)",
};

export function formatComparison(rows: readonly ScoredRun[]): string {
  const header = [
    "strategy",
    "cap",
    "trades",
    "closed PF",
    "CAGR",
    "max DD",
    "half-years",
    "exposure",
    "open",
    "unrealised",
    "drop1 PF",
    "drop1 CAGR",
    "drop3 PF",
    "drop3 CAGR",
    "drop5 PF",
    "drop5 CAGR",
    "exec PF",
    "exec CAGR",
    "2019 PF",
    "2019 ret",
    "2020 PF",
    "2020 ret",
    "2021 PF",
    "2021 ret",
    "2022 PF",
    "2022 ret",
    "2023 PF",
    "2023 ret",
  ];
  const lines = [header.join("\t")];
  for (const row of rows) {
    const stress = row.stress;
    const drop = (n: number) => stress?.concentration.find((item) => item.n === n);
    const year = (key: string) => stress?.years.find((item) => item.year === key);
    const cells = [
      FROZEN_LABELS[row.strategy] ?? row.strategy,
      row.params.capPct != null ? `${row.params.capPct}%` : "",
      String(row.score.trades),
      row.score.profitFactor.toFixed(3),
      row.score.cagrPct.toFixed(2),
      row.score.worstDrawdownPct.toFixed(2),
      row.score.halfYearsProfitablePct.toFixed(0),
      row.book.exposurePct.toFixed(1),
      String(row.book.openPositions.length),
      Math.round(row.book.unrealised).toString(),
      num(drop(1)?.profitFactor),
      num(drop(1)?.cagrPct),
      num(drop(3)?.profitFactor),
      num(drop(3)?.cagrPct),
      num(drop(5)?.profitFactor),
      num(drop(5)?.cagrPct),
      num(stress?.execution.profitFactor),
      num(stress?.execution.cagrPct),
    ];
    for (const key of ["2019", "2020", "2021", "2022", "2023"]) {
      cells.push(num(year(key)?.profitFactor), num(year(key)?.bookReturnPct));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

export function formatOpens(rows: readonly ScoredRun[]): string {
  const lines = ["Open at end. Unrealised is mark-to-market at the session close and does not include estimated exit charges."];
  for (const row of rows) {
    lines.push(`${FROZEN_LABELS[row.strategy] ?? row.strategy}: ${row.book.openPositions.length} positions, unrealised ₹${Math.round(row.book.unrealised)}`);
    for (const lot of row.book.openPositions) {
      lines.push(`  ${lot.symbol} qty ${lot.qty} entry ${lot.entryPx} mark ${lot.mark} unrealised ₹${Math.round(lot.unrealised)}${lot.pendingExit ? " pending exit" : ""}`);
    }
  }
  return lines.join("\n");
}

export function formatEligibility(eligibility: Record<string, { raw: number; history: number; value: number; kept: number }>): string {
  const lines = ["Signal eligibility. Traded-value removals are counted only after the 250-session history gate. This does not remove today's-list survivorship bias."];
  for (const name of ["rs", "momentum", "trend_breakout"]) {
    const row = eligibility[name];
    if (!row) continue;
    lines.push(`${name}: raw ${row.raw}, removed by clean history ${row.history}, removed by traded value ${row.value}, remaining ${row.kept}`);
  }
  return lines.join("\n");
}

export function formatAudits(removed: readonly RangeAudit[], adjusted: readonly RangeAudit[], breaks: readonly RangeAudit[]): string {
  const lines = ["Data adjustments and exclusions. Raw candles were not rewritten."];
  const write = (title: string, rows: readonly RangeAudit[]) => {
    lines.push(title);
    if (rows.length === 0) {
      lines.push("  none");
      return;
    }
    for (const row of rows) lines.push(`  ${row.symbol} ${row.from}..${row.to} ${row.bars} bars: ${row.reason}`);
  };
  write("Removed", removed);
  write("Adjusted", adjusted);
  write("New segments", breaks);
  return lines.join("\n");
}

export function formatIntersections(hits: ReadonlyArray<StoredTradeRef & { reason: string }>): string {
  const lines = [`Stored trades in runs 1–3 whose entry date sits in the new exclusion mask: ${hits.length}. Those runs were not rewritten.`];
  const counts = new Map<string, number>();
  for (const hit of hits) counts.set(`${hit.runId} ${hit.strategy} ${hit.symbol}`, (counts.get(`${hit.runId} ${hit.strategy} ${hit.symbol}`) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [key, count] of ranked.slice(0, 40)) lines.push(`  ${key}: ${count}`);
  if (ranked.length > 40) lines.push(`  … ${ranked.length - 40} more symbol rows`);
  return lines.join("\n");
}

export function formatOverlap(rows: readonly ScoredRun[]): string {
  const pick = (name: string) => name === "momentum"
    ? rows.find((row) => row.strategy === "momentum" && row.params.capPct === 15)
    : rows.find((row) => row.strategy === name && row.isDefault);
  const names = ["rs", "momentum", "trend_breakout"].map((name) => [name, pick(name)] as const).filter((pair): pair is [string, ScoredRun] => pair[1] != null);
  const lines: string[] = [];
  for (const [aName, a] of names) {
    for (const [bName, b] of names) {
      if (aName === bName) continue;
      lines.push(overlapNote(aName, bName, lossDayOverlap(a.lossDays, b.lossDays), lossDayOverlap(b.lossDays, a.lossDays)));
    }
  }
  return lines.join(" ");
}

function num(value: number | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : value.toFixed(3);
}
