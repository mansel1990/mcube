import { q } from "../db";
import { assertNoUnexplainedJumps, dailyJumps, goldSplitUnresolved, liquidUnitFindings, missingOnCalendar, rebalanceTimingFindings, triJoinJumps, yearlyLargestContributor } from "./audit";
import {
  loadLongtermDataset,
  longtermSeriesPoints,
  LONGTERM_BUILDING_FROM,
  LONGTERM_BUILDING_TO,
  LONGTERM_DATA_VERSION,
  LONGTERM_SERIES,
  type LongtermDataset,
} from "./data";
import { longtermV2InputFromStored, scoreLongtermV2, simulateLongterm, sleeveDisplayName } from "./simulate";
import { replayStatic } from "./static-replay";

type StoredRow = {
  id: string;
  status: string;
  sample: string;
  engine_sha: string | null;
  data: unknown;
  variant: string;
  metrics: unknown;
  equity: unknown;
  allocations: unknown;
  events: unknown;
  stresses: unknown;
};

export function parseVerifyArgs(argv: readonly string[]): number[] {
  let runs: number[] | null = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--runs") runs = readRuns(argv[++index]);
    else throw new Error(`Unknown longterm-verify option ${arg}`);
  }
  if (!runs?.length) throw new Error("longterm-verify needs --runs, for example --runs 9,10");
  return runs;
}

export async function longtermVerify(argv: readonly string[] = []): Promise<void> {
  const runs = parseVerifyArgs(argv);
  const rows = await q<StoredRow>(
    `SELECT u.id::text AS id, u.status, u.sample, u.engine_sha, u.data,
            r.variant, r.metrics, r.equity, r.allocations, r.events, r.stresses
       FROM mlive.mlive_research_runs u
       JOIN mlive.mlive_longterm_results r ON r.run_id = u.id
      WHERE u.id = ANY($1::bigint[])
      ORDER BY u.id, r.variant`,
    [runs]
  );
  const found = new Set(rows.map((row) => Number(row.id)));
  const missing = runs.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`Long Game verify could not read runs ${missing.join(", ")}.`);
  console.log(`longterm-verify runs ${runs.join(", ")} read-only. Data version ${LONGTERM_DATA_VERSION}.`);
  for (const id of runs) printStoredRun(rows.filter((row) => Number(row.id) === id));
  printStoredRescore(rows);
  const dataset = await loadLongtermDataset("building", { annotate: false });
  if (dataset.dates.some((date) => date >= "2024-01-01")) {
    throw new Error("Building verify load observed a held-back date.");
  }
  printInputAudit(dataset);
  printStaticParity(dataset, rows);
}

function printStoredRun(rows: StoredRow[]): void {
  const runId = rows[0]?.id ?? "?";
  console.log(`\nstored run ${runId} status ${rows[0]?.status ?? "missing"} sample ${rows[0]?.sample ?? ""} engine ${rows[0]?.engine_sha ?? ""}`);
  console.log(`stored fingerprint ${fingerprintOf(rows[0]?.data) || "not recorded"}`);
  for (const row of rows) {
    const metrics = record(row.metrics);
    const drawdown = record(metrics.maxDrawdown);
    const equity = points(row.equity);
    const allocations = points(row.allocations);
    const peakDate = String(drawdown.peakDate ?? "");
    const troughDate = String(drawdown.troughDate ?? "");
    const peak = equity.find((point) => point.date === peakDate);
    const trough = equity.find((point) => point.date === troughDate);
    const peakWeights = record(allocations.find((point) => point.date === peakDate)?.weights);
    const troughWeights = record(allocations.find((point) => point.date === troughDate)?.weights);
    console.log(`${row.variant} peak ${peakDate} equity ${money(peak?.value)} trough ${troughDate} equity ${money(trough?.value)} drawdown ${num(drawdown.pct).toFixed(2)}% recovery ${drawdown.recoveryDate ?? "none"}`);
    console.log(`  yearly ${formatRecord(record(metrics.calendarYearReturns))}`);
    console.log(`  weights at peak ${formatWeights(peakWeights)}`);
    console.log(`  weights at trough ${formatWeights(troughWeights)}`);
    console.log(`  sleeve drawdown contribution ${formatRecord(record(metrics.drawdownContributionApprox))}`);
    if (row.variant.startsWith("RADAR")) {
      const labels = Object.fromEntries(["nifty50", "secondary", "gold", "liquid"].map((sleeve) => [sleeve, sleeveDisplayName(row.variant, sleeve)]));
      const yearly = yearlyLargestContributor(
        allocations.map((point) => ({ date: String(point.date), values: numberRecord(point.values) })),
        labels
      );
      console.log(`  largest contributing asset by year ${yearly.map((item) => `${item.year} ${item.name} ${item.sharePct.toFixed(1)}%`).join("; ") || "unavailable"}`);
    }
  }
}

function printStoredRescore(rows: StoredRow[]): void {
  console.log("\nv2 rescore of stored metrics only");
  for (const id of [...new Set(rows.map((row) => row.id))]) {
    const runRows = rows.filter((row) => row.id === id);
    for (const radar of ["RADAR-NEXT", "RADAR-MID"] as const) {
      const control = radar === "RADAR-NEXT" ? "STATIC-NEXT" : "STATIC-MID";
      const radarRow = runRows.find((row) => row.variant === radar);
      const controlRow = runRows.find((row) => row.variant === control);
      if (!radarRow || !controlRow) {
        console.log(`run ${id} ${radar} rescore unavailable`);
        continue;
      }
      const comparison = scoreLongtermV2(
        longtermV2InputFromStored(radar, radarRow.metrics, radarRow.stresses),
        longtermV2InputFromStored(control, controlRow.metrics, controlRow.stresses)
      );
      const failed = Object.entries(comparison.checks).filter(([, pass]) => !pass).map(([name]) => name);
      console.log(`run ${id} ${radar} ${failed.length ? `fails ${failed.join(", ")}` : "passes every v2 check"} concentrated in ${String(comparison.details.concentratedSleeve)} override inspection-only`);
    }
  }
}

function printInputAudit(dataset: LongtermDataset): void {
  console.log("\ninput audit");
  const calendar = dataset.dates.filter((date) => date >= LONGTERM_BUILDING_FROM && date <= LONGTERM_BUILDING_TO);
  for (const key of LONGTERM_SERIES) {
    const series = [...dataset.values[key].entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
    const jumps = dailyJumps(key, series);
    console.log(`${key} points ${series.length} jumps over 15% ${jumps.length}${jumps.slice(0, 3).map((jump) => ` ${jump.date} ${jump.changePct.toFixed(1)}%`).join("")}`);
    const required = key === "nifty_1d_rate" ? calendar : dataset.dates;
    const missing = missingOnCalendar(required, new Set(series.map((point) => point.date)));
    console.log(`  missing on common calendar ${missing.length}${missing.length ? ` first ${missing.slice(0, 3).join(", ")}` : ""}`);
    if (key.endsWith("_tri")) {
      const cuts = dataset.provenance.filter((row) => row.seriesKey === key).map((row) => row.rawTo);
      const joins = triJoinJumps(key, series, cuts);
      console.log(`  TRI source-join jumps ${joins.length}`);
    }
    if (key === "nifty_1d_rate") {
      const findings = liquidUnitFindings(series);
      console.log(`  liquid units ${findings.length ? findings.join(" ") : "index level"}`);
    }
    if (key === "goldbees_nav") {
      console.log(`  gold split ${goldSplitUnresolved(jumps) ? "UNNORMALIZED 1:100 drop still present" : "no unnormalized split drop"}`);
    }
  }
  assertNoUnexplainedJumps(longtermSeriesPoints(dataset));
}

function printStaticParity(dataset: LongtermDataset, rows: StoredRow[]): void {
  console.log("\nindependent STATIC replay");
  for (const variant of ["STATIC-NEXT", "STATIC-MID"] as const) {
    const replay = replayStatic(dataset, variant);
    const simulated = simulateLongterm(dataset, variant);
    const sameDrawdown = Math.abs(replay.maxDrawdown.pct - simulated.metrics.maxDrawdown.pct) < 1e-6
      && replay.maxDrawdown.peakDate === simulated.metrics.maxDrawdown.peakDate
      && replay.maxDrawdown.troughDate === simulated.metrics.maxDrawdown.troughDate;
    const equityGap = maxGap(replay.equity.map((point) => point.value), simulated.equity.map((point) => point.value));
    console.log(`${variant} replay drawdown ${replay.maxDrawdown.pct.toFixed(2)}% ${replay.maxDrawdown.peakDate} equity ${money(replay.maxDrawdown.peakValue)} -> ${replay.maxDrawdown.troughDate} equity ${money(replay.maxDrawdown.troughValue)}`);
    console.log(`  simulator drawdown ${simulated.metrics.maxDrawdown.pct.toFixed(2)}% ${simulated.metrics.maxDrawdown.peakDate} -> ${simulated.metrics.maxDrawdown.troughDate} match ${sameDrawdown} max equity gap ${equityGap.toFixed(6)}`);
    console.log(`  simulator fingerprint ${simulated.runIdentity.dataFingerprint}`);
    const timing = rebalanceTimingFindings(simulated.events.filter((event) => event.kind === "annual" || event.kind === "drift"), dataset.dates);
    console.log(`  rebalance timing ${timing.length ? timing.join(" ") : "next-session annual and drift"}`);
    for (const row of rows.filter((item) => item.variant === variant)) {
      const stored = record(record(row.metrics).maxDrawdown);
      console.log(`  stored run ${row.id} drawdown ${num(stored.pct).toFixed(2)}% fingerprint ${fingerprintOf(row.data) || "not recorded"} current ${dataset.fingerprint}`);
    }
  }
}

function readRuns(value: string | undefined): number[] {
  const runs = [...new Set((value ?? "").split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0))];
  if (!runs.length) throw new Error("--runs needs comma-separated run ids, for example 9,10");
  return runs;
}

function fingerprintOf(value: unknown): string {
  const data = record(value);
  return typeof data.dataFingerprint === "string" ? data.dataFingerprint : "";
}

function points(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(record(value)).map(([key, item]) => [key, num(item)]));
}

function num(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function money(value: unknown): string {
  return num(value).toFixed(2);
}

function formatRecord(values: Record<string, unknown>): string {
  const entries = Object.entries(values);
  if (!entries.length) return "none";
  return entries.map(([key, value]) => `${key} ${num(value).toFixed(2)}`).join(", ");
}

function formatWeights(values: Record<string, unknown>): string {
  const keys = ["nifty50", "secondary", "gold", "liquid"];
  return keys.map((key) => `${key} ${(num(values[key]) * 100).toFixed(1)}%`).join(", ");
}

function maxGap(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let gap = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index++) gap = Math.max(gap, Math.abs(left[index] - right[index]));
  return gap;
}
