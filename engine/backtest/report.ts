import { halfYearAccount, legacyHalfYearLabel, lossDayOverlap, overlapNote } from "@/lib/mlive/research-bar";
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
  if (rows.some((row) => row.variant)) return formatVariantComparison(rows);
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

function formatVariantComparison(rows: readonly ScoredRun[]): string {
  const header = [
    "variant", "strategy", "trades", "PF", "avg net %", "win %", "CAGR %", "max DD %",
    "DD peak", "DD trough", "recovered", "DD ₹", "profitable half-years", "gates",
    "avg gross %", "max gross %", "avg open", "max open", "avg cash %", "avg order ₹",
    "closed charges ₹", "charges/gross profit %",
    "held", "daily buy cap", "max open", "per strategy", "sector", "daily deploy",
    "gross cap", "position cap", "cash", "min/whole-share", "unfilled limit",
    "drop1 PF", "drop1 CAGR", "drop3 PF", "drop3 CAGR", "drop5 PF", "drop5 CAGR",
    "exec PF", "exec CAGR",
  ];
  const lines = [
    "Historical reference only — Run 4 Momentum 15%: 247 trades, PF 2.145, avg net 3.4661%, CAGR 33.1286%, max DD 23.4895%, 6/10 profitable half-years, exposure 59.6145%. It is not rerun or stored as a new row.",
    header.join("\t"),
  ];
  for (const row of rows) {
    const stress = row.stress;
    const drop = (n: number) => stress?.concentration.find((item) => item.n === n);
    const dd = drawdown(row.book.equity);
    const charges = row.book.trades.reduce((sum, trade) => sum + trade.charges, 0);
    const grossProfit = row.book.trades.reduce((sum, trade) => sum + Math.max(0, trade.gross), 0);
    const blocks = row.book.blocks;
    const gates = [
      row.score.profitFactor >= 1.4,
      row.score.trades >= 150,
      row.score.avgNetPct >= 0.8,
      row.score.halfYearsProfitablePct >= 70,
      row.score.worstDrawdownPct <= 15,
    ].filter(Boolean).length;
    lines.push([
      row.variant ?? row.paramsKey,
      FROZEN_LABELS[row.strategy] ?? row.strategy,
      row.score.trades,
      row.score.profitFactor.toFixed(3),
      row.score.avgNetPct.toFixed(4),
      (row.score.winRate * 100).toFixed(1),
      row.score.cagrPct.toFixed(2),
      row.score.worstDrawdownPct.toFixed(2),
      dd.peakDate,
      dd.troughDate,
      dd.recoveryDate,
      Math.round(dd.rupeeLoss),
      halfYearCell(row),
      `${gates}/5`,
      row.book.exposurePct.toFixed(1),
      row.book.maxExposurePct.toFixed(1),
      row.book.avgOpenCount.toFixed(2),
      row.book.maxOpenCount,
      row.book.avgCashPct.toFixed(1),
      Math.round(row.book.avgOrderNotional),
      Math.round(charges),
      grossProfit > 0 ? ((charges / grossProfit) * 100).toFixed(2) : "",
      blocks.held,
      blocks.cappedBuys,
      blocks.cappedOpen,
      blocks.cappedStrategy,
      blocks.sector,
      blocks.deploy,
      blocks.grossExposure,
      blocks.positionCap,
      blocks.insufficientCash,
      blocks.minimumOrder,
      blocks.unfilledLimit,
      num(drop(1)?.profitFactor),
      num(drop(1)?.cagrPct),
      num(drop(3)?.profitFactor),
      num(drop(3)?.cagrPct),
      num(drop(5)?.profitFactor),
      num(drop(5)?.cagrPct),
      num(stress?.execution.profitFactor),
      num(stress?.execution.cagrPct),
    ].join("\t"));
  }
  lines.push("Official building gates: PF ≥1.4; trades ≥150; average net ≥0.8%; profitable complete half-years ≥70%; max drawdown ≤15%.");
  lines.push(`The old "n/10" cell was ${legacyHalfYearLabel(50)} whenever the stored rate was 50%, because it divided the percentage by 10 and always assumed the ten half-years of 2019–2023. That label is not used.`);
  for (const row of rows) {
    const account = halfYearAccount(row.periods ?? []);
    if (!row.periods?.length) continue;
    for (const period of account.complete) {
      lines.push(`${row.variant} ${period.key} complete start ${Math.round(period.start)} end ${Math.round(period.end)} return ${period.returnPct.toFixed(2)}%`);
    }
    for (const period of account.incomplete) {
      lines.push(`${row.variant} ${period.key} incomplete start ${Math.round(period.start)} end ${Math.round(period.end)} return ${period.returnPct.toFixed(2)}%. Excluded from ${account.label}.`);
    }
    lines.push(`${row.variant}: ${account.label}. Removing large winners is a concentration stress, not a strategy variant. Positive-skew momentum is expected to need large winners; one held-back sample does not show that the concentration repeats.`);
  }
  for (const row of rows) {
    const worstTrades = [...row.book.trades].sort((a, b) => a.net - b.net).slice(0, 5).map((trade) => `${trade.symbol} ₹${Math.round(trade.net)}`).join(", ");
    const sectors = new Map<string, number>();
    for (const trade of row.book.trades) sectors.set(trade.sector, (sectors.get(trade.sector) ?? 0) + trade.net);
    const worstSectors = [...sectors].sort((a, b) => a[1] - b[1]).slice(0, 3).map(([sector, net]) => `${sector} ₹${Math.round(net)}`).join(", ");
    const annual = row.stress?.years.map((year) => `${year.year}: PF ${year.profitFactor.toFixed(2)}, ret ${year.bookReturnPct.toFixed(1)}%`).join("; ") ?? "";
    lines.push(`${row.variant}: worst closed contributors ${worstTrades || "none"}; worst sectors ${worstSectors || "none"}; annual ${annual || "none"}.`);
  }
  return lines.join("\n");
}

function drawdown(equity: readonly { date: string; value: number }[]): {
  peakDate: string;
  troughDate: string;
  recoveryDate: string;
  rupeeLoss: number;
} {
  if (!equity.length) return { peakDate: "", troughDate: "", recoveryDate: "", rupeeLoss: 0 };
  let peak = equity[0].value;
  let peakAt = 0;
  let worstPeak = 0;
  let troughAt = 0;
  let worstLoss = 0;
  for (let i = 1; i < equity.length; i++) {
    if (equity[i].value > peak) {
      peak = equity[i].value;
      peakAt = i;
    }
    const loss = peak - equity[i].value;
    if (loss > worstLoss) {
      worstLoss = loss;
      worstPeak = peakAt;
      troughAt = i;
    }
  }
  const peakValue = equity[worstPeak].value;
  const recovered = equity.slice(troughAt + 1).find((point) => point.value >= peakValue);
  return {
    peakDate: equity[worstPeak].date,
    troughDate: equity[troughAt].date,
    recoveryDate: recovered?.date ?? "not recovered",
    rupeeLoss: worstLoss,
  };
}

export function formatOpens(rows: readonly ScoredRun[]): string {
  const lines = ["Open at end. Unrealised is mark-to-market at the session close and does not include estimated exit charges."];
  for (const row of rows) {
    lines.push(`${row.variant ?? FROZEN_LABELS[row.strategy] ?? row.strategy}: ${row.book.openPositions.length} positions, unrealised ₹${Math.round(row.book.unrealised)}`);
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

function halfYearCell(row: ScoredRun): string {
  if (row.periods?.length) return halfYearAccount(row.periods).label;
  return `${row.score.halfYearsProfitablePct.toFixed(0)}%`;
}

function num(value: number | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : value.toFixed(3);
}
