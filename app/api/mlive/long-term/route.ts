import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { heldbackPairs } from "@/engine/longterm/heldback";
import { longtermV2InputFromStored, scoreLongtermV2 } from "@/engine/longterm/score";
import { loadPendingProposal, proposalView, readProposalGate } from "@/engine/longterm/proposal-db";
import { buildingGateFromPairs, heldbackStatusForVariant, latestValidRun, SUPERSEDED_LONGTERM_LABEL, SUPERSEDED_LONGTERM_RUNS } from "@/lib/mlive/long-game-status";
import { sql } from "@/lib/sql";

type RunRow = {
  id: unknown;
  book: unknown;
  sample: unknown;
  status: unknown;
  requested_at: unknown;
  started_at: unknown;
  finished_at: unknown;
  params: unknown;
  data: unknown;
  error: unknown;
  note: unknown;
  engine_sha: unknown;
};

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const runs = await sql`
      SELECT id, book, sample, status, requested_at, started_at, finished_at,
             params, data, error, note, engine_sha
        FROM mlive.mlive_research_runs
       WHERE book = 'longterm'
       ORDER BY id DESC
       LIMIT 40` as RunRow[];
    const listed = runs.map((row) => ({ ...row, id: Number(row.id), sample: String(row.sample), status: String(row.status) }));
    const buildingRef = latestValidRun(listed, "building");
    const heldRef = latestValidRun(listed, "heldback");
    const buildingRows = buildingRef ? await resultRows(buildingRef.id) : [];
    const heldRows = heldRef ? await resultRows(heldRef.id) : [];
    const building = buildingRows.map(mapResult);
    const heldback = heldRows.map(mapResult);
    const gate = buildingRef ? buildingGateFromPairs(heldbackPairs(building)) : null;
    const variants = ["STATIC-NEXT", "RADAR-NEXT", "STATIC-MID", "RADAR-MID"];
    const heldbackStatus = variants.map((variant) => ({
      variant,
      ...heldbackStatusForVariant({
        variant,
        conclusion: conclusionOf(heldback.find((row) => row.variant === variant)?.metrics),
        gate,
      }),
    }));
    let proposal = null;
    let live = false;
    try {
      const activation = await readProposalGate();
      live = activation.enabled.includes("longterm");
      const pending = await loadPendingProposal();
      proposal = pending ? proposalView(pending) : null;
    } catch {
      proposal = null;
    }
    const buildingRun = buildingRef ? runs.find((row) => Number(row.id) === buildingRef.id) : undefined;
    return NextResponse.json({
      run: buildingRun ? mapRun(buildingRun) : null,
      results: building,
      comparisons: rescore(building),
      heldback: heldRef ? {
        run: mapRun(runs.find((row) => Number(row.id) === heldRef.id) as RunRow),
        results: heldback,
        comparisons: rescore(heldback),
      } : null,
      heldbackStatus,
      superseded: {
        label: SUPERSEDED_LONGTERM_LABEL,
        runIds: [...SUPERSEDED_LONGTERM_RUNS],
        correctedRunId: buildingRef?.id ?? null,
      },
      live,
      proposal,
      locked: !live,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("mlive_research_runs") || message.includes("mlive_longterm_results")) {
      return NextResponse.json(
        { error: "Long Game research tables are not ready. Run scripts/sql/mlive/013_longterm_research.sql." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Long Game research could not be loaded." }, { status: 500 });
  }
}

async function resultRows(runId: number): Promise<Record<string, unknown>[]> {
  const rows = await sql`
    SELECT variant, control_variant, metrics, equity, allocations, events,
           stresses, provenance, passed, fail_reasons
      FROM mlive.mlive_longterm_results
     WHERE run_id = ${runId}
     ORDER BY CASE variant
       WHEN 'STATIC-NEXT' THEN 1
       WHEN 'RADAR-NEXT' THEN 2
       WHEN 'STATIC-MID' THEN 3
       WHEN 'RADAR-MID' THEN 4
       ELSE 5
     END`;
  return rows as unknown as Record<string, unknown>[];
}

function conclusionOf(metrics: Record<string, unknown> | undefined): string | null {
  const value = metrics?.conclusion;
  return value === "qualifies for live design" || value === "does not qualify" ? value : null;
}

function mapRun(row: RunRow) {
  return {
    id: Number(row.id),
    book: String(row.book),
    sample: String(row.sample),
    status: String(row.status),
    requestedAt: stamp(row.requested_at),
    startedAt: stamp(row.started_at),
    finishedAt: stamp(row.finished_at),
    params: objectOf(row.params),
    data: objectOf(row.data),
    error: row.error == null ? "" : String(row.error),
    note: row.note == null ? "" : String(row.note),
    engineSha: row.engine_sha == null ? "" : String(row.engine_sha),
  };
}

function mapResult(row: Record<string, unknown>) {
  return {
    variant: String(row.variant),
    controlVariant: row.control_variant == null ? null : String(row.control_variant),
    metrics: objectOf(row.metrics),
    equity: arrayOf(row.equity),
    allocations: arrayOf(row.allocations),
    events: arrayOf(row.events),
    stresses: objectOf(row.stresses),
    provenance: arrayOf(row.provenance),
    passed: row.passed === true,
    failReasons: Array.isArray(row.fail_reasons) ? row.fail_reasons.map(String) : [],
  };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function objectOf(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function arrayOf(value: unknown): unknown[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function stamp(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return text || null;
}

function rescore(results: { variant: string; metrics: Record<string, unknown>; stresses: Record<string, unknown> }[]) {
  const byVariant = new Map(results.map((row) => [row.variant, row]));
  const pairs = [
    ["RADAR-NEXT", "STATIC-NEXT"],
    ["RADAR-MID", "STATIC-MID"],
  ] as const;
  const comparisons = [];
  for (const [radar, control] of pairs) {
    const radarRow = byVariant.get(radar);
    const controlRow = byVariant.get(control);
    if (!radarRow || !controlRow) continue;
    comparisons.push(scoreLongtermV2(
      longtermV2InputFromStored(radar, radarRow.metrics, radarRow.stresses),
      longtermV2InputFromStored(control, controlRow.metrics, controlRow.stresses)
    ));
  }
  return comparisons;
}
