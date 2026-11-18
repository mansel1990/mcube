import { heldbackBlock } from "@/lib/mlive/research-bar";
import { q } from "../db";
import {
  latestCommonCompleteSession,
  loadLongtermDataset,
  LONGTERM_HELD_BACK_FROM,
  type LongtermDataset,
} from "./data";
import { LONGTERM_VARIANT_NAMES, type LongtermVariantName } from "./variants";

export const LONGTERM_HELDBACK_USED_SQL = `
  SELECT DISTINCT r.variant
    FROM mlive.mlive_longterm_results r
    JOIN mlive.mlive_research_runs u ON u.id = r.run_id
   WHERE u.book = 'longterm'
     AND u.sample = 'heldback'
     AND u.status = 'ok'
     AND r.variant = ANY($1::text[])`;

export type HeldbackGatePair = {
  radar: "RADAR-NEXT" | "RADAR-MID";
  radarDrawdownPct: number;
  staticDrawdownPct: number;
  radarAfterTaxCagrPct: number;
  staticAfterTaxCagrPct: number;
};

export function heldbackVariantsConsumed(rows: readonly { variant: string; status: string }[]): string[] {
  return [...new Set(rows.filter((row) => row.status === "ok").map((row) => row.variant))];
}

export function heldbackAccessGate(pairs: readonly HeldbackGatePair[]): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const pair of pairs) {
    if (!(pair.radarDrawdownPct < pair.staticDrawdownPct)) {
      failures.push(`${pair.radar} building drawdown is not lower than its STATIC benchmark.`);
    }
    if (!(pair.radarAfterTaxCagrPct > pair.staticAfterTaxCagrPct)) {
      failures.push(`${pair.radar} after-tax CAGR is not strictly higher than its STATIC benchmark.`);
    }
  }
  return { pass: failures.length === 0 && pairs.length === 2, failures };
}

export function heldbackPairs(rows: readonly { variant: string; metrics: unknown; stresses: unknown }[]): HeldbackGatePair[] | null {
  const byVariant = new Map(rows.map((row) => [row.variant, row]));
  const next = pairFrom(byVariant, "RADAR-NEXT", "STATIC-NEXT");
  const mid = pairFrom(byVariant, "RADAR-MID", "STATIC-MID");
  if (!next || !mid) return null;
  return [next, mid];
}

export function sharedHeldbackWindow(variants: readonly string[], lastSession: string): { from: string; to: string } {
  if (variants.length !== LONGTERM_VARIANT_NAMES.length || LONGTERM_VARIANT_NAMES.some((name) => !variants.includes(name))) {
    throw new Error("Long Game held-back runs exactly all four frozen variants in one shared window.");
  }
  if (lastSession < LONGTERM_HELD_BACK_FROM) {
    throw new Error("Held-back window has no common complete session.");
  }
  return { from: LONGTERM_HELD_BACK_FROM, to: lastSession };
}

export async function openHeldbackDataset(deps: {
  loadBuilding: () => Promise<LongtermDataset>;
  buildingRows: (fingerprint: string) => Promise<{ variant: string; metrics: unknown; stresses: unknown }[]>;
  usedVariants: () => Promise<string[]>;
  requested: readonly string[];
  force: boolean;
  loadHeldback: () => Promise<LongtermDataset>;
}): Promise<LongtermDataset> {
  const building = await deps.loadBuilding();
  if (building.dates.some((date) => date >= LONGTERM_HELD_BACK_FROM)) {
    throw new Error("Building load observed a held-back date.");
  }
  const pairs = heldbackPairs(await deps.buildingRows(building.fingerprint));
  if (!pairs) {
    throw new Error("Held-back stopped before loading held-back data. A corrected all-four building run on the current fingerprint is required.");
  }
  const gate = heldbackAccessGate(pairs);
  if (!gate.pass) {
    throw new Error(`Held-back stopped before loading held-back data. ${gate.failures.join(" ")}`);
  }
  const blocked = heldbackBlock(await deps.usedVariants(), deps.requested, deps.force);
  if (blocked) throw new Error(blocked);
  return deps.loadHeldback();
}

export async function loadGuardedHeldbackDataset(force: boolean): Promise<LongtermDataset> {
  return openHeldbackDataset({
    loadBuilding: () => loadLongtermDataset("building", { annotate: false }),
    buildingRows: (fingerprint) => storedBuildingRows(fingerprint),
    usedVariants: () => longtermHeldbackUsed(),
    requested: [...LONGTERM_VARIANT_NAMES],
    force,
    loadHeldback: () => loadLongtermDataset("heldback"),
  });
}

export function heldbackDatasetWindow(dataset: LongtermDataset): { from: string; to: string } {
  return sharedHeldbackWindow([...LONGTERM_VARIANT_NAMES], latestCommonCompleteSession(dataset.dates));
}

async function storedBuildingRows(fingerprint: string): Promise<{ variant: string; metrics: unknown; stresses: unknown }[]> {
  return q(
    `SELECT r.variant, r.metrics, r.stresses
       FROM mlive.mlive_longterm_results r
       JOIN mlive.mlive_research_runs u ON u.id = r.run_id
      WHERE u.book = 'longterm'
        AND u.sample = 'building'
        AND u.status = 'ok'
        AND u.data->>'dataFingerprint' = $1
        AND u.id = (
          SELECT id FROM mlive.mlive_research_runs
           WHERE book = 'longterm' AND sample = 'building' AND status = 'ok'
             AND data->>'dataFingerprint' = $1
           ORDER BY id DESC
           LIMIT 1
        )`,
    [fingerprint]
  );
}

export async function longtermHeldbackUsed(): Promise<string[]> {
  const rows = await q<{ variant: string }>(LONGTERM_HELDBACK_USED_SQL, [[...LONGTERM_VARIANT_NAMES]]);
  return rows.map((row) => row.variant);
}

function pairFrom(
  rows: Map<string, { variant: string; metrics: unknown; stresses: unknown }>,
  radar: "RADAR-NEXT" | "RADAR-MID",
  control: "STATIC-NEXT" | "STATIC-MID"
): HeldbackGatePair | null {
  const radarRow = rows.get(radar);
  const controlRow = rows.get(control);
  if (!radarRow || !controlRow) return null;
  const radarDrawdownPct = nestedNumber(radarRow.metrics, ["maxDrawdown", "pct"]);
  const staticDrawdownPct = nestedNumber(controlRow.metrics, ["maxDrawdown", "pct"]);
  const radarAfterTaxCagrPct = nestedNumber(radarRow.stresses, ["currentTax", "cagrPct"]);
  const staticAfterTaxCagrPct = nestedNumber(controlRow.stresses, ["currentTax", "cagrPct"]);
  if (
    radarDrawdownPct == null
    || staticDrawdownPct == null
    || radarAfterTaxCagrPct == null
    || staticAfterTaxCagrPct == null
  ) return null;
  return { radar, radarDrawdownPct, staticDrawdownPct, radarAfterTaxCagrPct, staticAfterTaxCagrPct };
}

function nestedNumber(value: unknown, path: string[]): number | null {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  const number = Number(current);
  return Number.isFinite(number) ? number : null;
}

export function isFullLongtermSet(variants: readonly string[]): variants is LongtermVariantName[] {
  return variants.length === LONGTERM_VARIANT_NAMES.length && LONGTERM_VARIANT_NAMES.every((name) => variants.includes(name));
}
