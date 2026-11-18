import { engineSha } from "@/lib/mlive/engine-sha";
import type { ResearchIdentity } from "@/lib/mlive/research-page";
import type { ResearchArgs } from "../backtest/args";
import { q } from "../db";
import { assertNoUnexplainedJumps } from "./audit";
import { latestCommonCompleteSession, loadLongtermDataset, longtermSeriesPoints, LONGTERM_BUILDING_FROM, LONGTERM_BUILDING_TO, LONGTERM_HELD_BACK_FROM } from "./data";
import { heldbackDatasetWindow, inspectionHeldbackWindow, isFullLongtermSet, loadGuardedHeldbackDataset } from "./heldback";
import { frozenV3OverrideCommand, overrideConsumedByCommit, overrideRecord } from "./override";
import { CORRECTED_BUILDING_LINK, LONGTERM_FROZEN_V2, LONGTERM_FROZEN_V3 } from "./rules";
import {
  compareLongterm,
  liveDesignConclusion,
  simulateLongterm,
  type AcceptanceComparison,
  type LongtermResult,
  type LongtermSimulationOptions,
} from "./simulate";
import { LONGTERM_VARIANT_NAMES, type LongtermVariantName } from "./variants";

export async function executeLongtermResearch(
  runId: number,
  args: ResearchArgs,
  identity: ResearchIdentity
): Promise<void> {
  if (args.grid) throw new Error("Long Game parameter grids are forbidden.");
  const variants = selectedVariants(args.variants);
  const heldback = args.sample === "heldback";
  const inspection = frozenV3OverrideCommand({
    book: "longterm",
    sample: args.sample,
    confirmHeldback: args.confirmHeldback,
    ownerOverride: args.ownerOverride,
    grid: args.grid,
    variants,
  });
  if (heldback) {
    if (!args.confirmHeldback) throw new Error("Long Game held-back requires --confirm-heldback.");
    if (!inspection && !isFullLongtermSet(variants)) {
      throw new Error("Long Game held-back runs exactly all four frozen variants in one shared window.");
    }
  }
  const dataset = heldback
    ? await loadGuardedHeldbackDataset(args.force, args.ownerOverride, runId)
    : await loadLongtermDataset("building");
  if (!heldback && dataset.dates.some((date) => date >= LONGTERM_HELD_BACK_FROM)) {
    throw new Error("Long Game data loader exposed held-back dates.");
  }
  if (!heldback && isFullLongtermSet(variants)) assertNoUnexplainedJumps(longtermSeriesPoints(dataset));
  const window = heldback
    ? (inspection ? inspectionHeldbackWindow(latestCommonCompleteSession(dataset.dates)) : heldbackDatasetWindow(dataset))
    : { from: LONGTERM_BUILDING_FROM, to: LONGTERM_BUILDING_TO };
  const simulation: LongtermSimulationOptions = heldback ? { window, sample: "heldback" } : {};
  console.log(`research sample ${heldback ? "heldback" : "building"} window ${window.from} through ${window.to}`);
  const corrected = !heldback && isFullLongtermSet(variants) ? CORRECTED_BUILDING_LINK : null;
  const params = {
    strategies: variants,
    variants,
    grid: false,
    window,
    capital: { fund: 100_000, contributions: 0, withdrawals: 0 },
    researchOnly: true,
    liveActivation: false,
    rulesVersion: inspection ? LONGTERM_FROZEN_V3.version : LONGTERM_FROZEN_V2.version,
    ...(inspection ? { ownerOverride: LONGTERM_FROZEN_V3.version, inspectionOnly: true } : {}),
    identity,
    ...(corrected ? { supersedesRunIds: corrected.supersedesRunIds, supersedesReason: corrected.reason } : {}),
  };
  await q(
    `UPDATE mlive.mlive_research_runs
        SET status = 'running', started_at = COALESCE(started_at, now()), params = $2::jsonb, error = NULL
      WHERE id = $1`,
    [runId, JSON.stringify(params)]
  );
  await q(`DELETE FROM mlive.mlive_longterm_results WHERE run_id = $1`, [runId]);

  const results = new Map<LongtermVariantName, LongtermResult>();
  for (const variant of variants) results.set(variant, simulateLongterm(dataset, variant, simulation));
  const comparisons: AcceptanceComparison[] = [];
  addComparison(results, comparisons, "RADAR-NEXT", "STATIC-NEXT");
  addComparison(results, comparisons, "RADAR-MID", "STATIC-MID");
  const comparisonByRadar = new Map(comparisons.map((row) => [row.radar, row]));
  const conclusions: Record<string, string> = {};

  for (const [variant, result] of results) {
    const comparison = variant.startsWith("RADAR") ? comparisonByRadar.get(variant as "RADAR-NEXT" | "RADAR-MID") : undefined;
    const failReasons = comparison ? Object.entries(comparison.checks).filter(([, pass]) => !pass).map(([name]) => name) : [];
    const conclusion = comparison ? liveDesignConclusion(comparison.qualified) : undefined;
    if (conclusion) conclusions[variant] = conclusion;
    await q(
      `INSERT INTO mlive.mlive_longterm_results
         (run_id, variant, control_variant, metrics, equity, allocations, events, stresses, provenance, passed, fail_reasons)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::text[])`,
      [
        runId,
        variant,
        result.benchmark,
        JSON.stringify({
          ...result.metrics,
          sample: result.sample,
          runIdentity: result.runIdentity,
          wholeUnit: result.wholeUnit,
          ...(conclusion ? { conclusion } : {}),
        }),
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
  if (inspection && !overrideConsumedByCommit("ok", [...results.keys()])) {
    throw new Error("The override is not consumed until both STATIC-MID and RADAR-MID results are stored.");
  }
  const sampleDates = dataset.dates.filter((date) => date >= window.from && date <= window.to);
  const note = heldback
    ? `${comparisons.map((row) => `${row.radar} ${liveDesignConclusion(row.qualified)}`).join(". ")}. Research only. No candidate was activated.`
    : buildingNote(comparisons);
  await q(
    `UPDATE mlive.mlive_research_runs
        SET status = 'ok', finished_at = now(), note = $2, data = $3::jsonb, engine_sha = $4
      WHERE id = $1`,
    [
      runId,
      note,
      JSON.stringify({
        first: sampleDates[0] ?? window.from,
        last: sampleDates.at(-1) ?? window.to,
        dataFingerprint: dataset.fingerprint,
        comparisons,
        conclusions,
        rules: inspection ? LONGTERM_FROZEN_V3 : LONGTERM_FROZEN_V2,
        researchOnly: true,
        liveActivation: false,
        heldbackInspected: heldback,
        ...(inspection ? { override: overrideRecord(true) } : {}),
        ...(corrected ? { supersedesRunIds: corrected.supersedesRunIds, supersedesReason: corrected.reason } : {}),
      }),
      engineSha(),
    ]
  );
  console.log(note);
  if (heldback) {
    for (const [variant, conclusion] of Object.entries(conclusions)) console.log(`${variant}: ${conclusion}`);
  }
}

function buildingNote(comparisons: AcceptanceComparison[]): string {
  const qualified = comparisons.filter((row) => row.qualified).map((row) => row.radar);
  return qualified.length
    ? `Building sample complete. ${qualified.join(", ")} earned a later held-back test; no candidate was activated.`
    : "Building sample complete. No RADAR candidate earned a held-back test; no thresholds were tuned.";
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
