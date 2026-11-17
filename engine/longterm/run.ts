import { engineSha } from "@/lib/mlive/engine-sha";
import type { ResearchIdentity } from "@/lib/mlive/research-page";
import type { ResearchArgs } from "../backtest/args";
import { q } from "../db";
import { loadLongtermDataset, LONGTERM_BUILDING_FROM, LONGTERM_BUILDING_TO } from "./data";
import { compareLongterm, simulateLongterm, type AcceptanceComparison, type LongtermResult } from "./simulate";
import { LONGTERM_VARIANT_NAMES, type LongtermVariantName } from "./variants";

export async function executeLongtermResearch(
  runId: number,
  args: ResearchArgs,
  identity: ResearchIdentity
): Promise<void> {
  if (args.sample !== "building") throw new Error("Long Game held-back data is locked for this task.");
  if (args.grid) throw new Error("Long Game parameter grids are forbidden.");
  const variants = selectedVariants(args.variants);
  console.log(`research sample building window ${LONGTERM_BUILDING_FROM} through ${LONGTERM_BUILDING_TO}`);
  const dataset = await loadLongtermDataset();
  if (dataset.dates.some((date) => date >= "2024-01-01")) {
    throw new Error("Long Game data loader exposed held-back dates.");
  }
  const params = {
    strategies: variants,
    variants,
    grid: false,
    window: { from: LONGTERM_BUILDING_FROM, to: LONGTERM_BUILDING_TO },
    capital: { fund: 100_000, contributions: 0, withdrawals: 0 },
    researchOnly: true,
    liveActivation: false,
    identity,
  };
  await q(
    `UPDATE mlive.mlive_research_runs
        SET status = 'running', started_at = COALESCE(started_at, now()), params = $2::jsonb, error = NULL
      WHERE id = $1`,
    [runId, JSON.stringify(params)]
  );
  await q(`DELETE FROM mlive.mlive_longterm_results WHERE run_id = $1`, [runId]);

  const results = new Map<LongtermVariantName, LongtermResult>();
  for (const variant of variants) results.set(variant, simulateLongterm(dataset, variant));
  const comparisons: AcceptanceComparison[] = [];
  addComparison(results, comparisons, "RADAR-NEXT", "STATIC-NEXT");
  addComparison(results, comparisons, "RADAR-MID", "STATIC-MID");
  const comparisonByRadar = new Map(comparisons.map((row) => [row.radar, row]));

  for (const [variant, result] of results) {
    const comparison = variant.startsWith("RADAR") ? comparisonByRadar.get(variant as "RADAR-NEXT" | "RADAR-MID") : undefined;
    const failReasons = comparison ? Object.entries(comparison.checks).filter(([, pass]) => !pass).map(([name]) => name) : [];
    await q(
      `INSERT INTO mlive.mlive_longterm_results
         (run_id, variant, control_variant, metrics, equity, allocations, events, stresses, provenance, passed, fail_reasons)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::text[])`,
      [
        runId,
        variant,
        result.benchmark,
        JSON.stringify({ ...result.metrics, sample: result.sample, runIdentity: result.runIdentity, wholeUnit: result.wholeUnit }),
        JSON.stringify(result.equity),
        JSON.stringify(result.allocations),
        JSON.stringify(result.events),
        JSON.stringify(result.stress),
        JSON.stringify(result.provenance),
        comparison?.qualified ?? false,
        failReasons,
      ]
    );
  }
  const qualified = comparisons.filter((row) => row.qualified).map((row) => row.radar);
  const buildingDates = dataset.dates.filter((date) => date >= LONGTERM_BUILDING_FROM && date <= LONGTERM_BUILDING_TO);
  const note = qualified.length
    ? `Building sample complete. ${qualified.join(", ")} earned a later held-back test; no candidate was activated.`
    : "Building sample complete. No RADAR candidate earned a held-back test; no thresholds were tuned.";
  await q(
    `UPDATE mlive.mlive_research_runs
        SET status = 'ok', finished_at = now(), note = $2, data = $3::jsonb, engine_sha = $4
      WHERE id = $1`,
    [
      runId,
      note,
      JSON.stringify({
        first: buildingDates[0] ?? LONGTERM_BUILDING_FROM,
        last: buildingDates.at(-1) ?? LONGTERM_BUILDING_TO,
        dataFingerprint: dataset.fingerprint,
        comparisons,
        researchOnly: true,
        heldbackInspected: false,
      }),
      engineSha(),
    ]
  );
  console.log(note);
}

function selectedVariants(input: ResearchArgs["variants"]): LongtermVariantName[] {
  const raw = input?.length ? input : [...LONGTERM_VARIANT_NAMES];
  const variants = raw.filter((value): value is LongtermVariantName => (LONGTERM_VARIANT_NAMES as readonly string[]).includes(value));
  if (variants.length !== raw.length) throw new Error("A non-Long Game variant reached the Long Game runner.");
  return [...new Set(variants)];
}

function addComparison(
  results: Map<LongtermVariantName, LongtermResult>,
  output: AcceptanceComparison[],
  radar: "RADAR-NEXT" | "RADAR-MID",
  control: "STATIC-NEXT" | "STATIC-MID"
): void {
  const radarResult = results.get(radar);
  const controlResult = results.get(control);
  if (radarResult && controlResult) output.push(compareLongterm(radarResult, controlResult));
}
