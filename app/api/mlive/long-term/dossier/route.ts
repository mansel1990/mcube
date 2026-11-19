import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { latestValidRun, SUPERSEDED_LONGTERM_LABEL, SUPERSEDED_LONGTERM_RUNS } from "@/lib/mlive/long-game-status";
import { sql } from "@/lib/sql";

type RunRow = {
  id: unknown;
  sample: unknown;
  status: unknown;
  finished_at: unknown;
  params: unknown;
  data: unknown;
};

/** Research-only Long Game dossier. It does not read live activation, locks, or suggestions. */
export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const runs = await sql`
    SELECT id, sample, status, finished_at, params, data
      FROM mlive.mlive_research_runs
     WHERE book = 'longterm'
     ORDER BY id DESC
     LIMIT 40` as RunRow[];
  const listed = runs.map((row) => ({ id: Number(row.id), sample: String(row.sample), status: String(row.status) }));
  const buildingRef = latestValidRun(listed, "building");
  const heldRef = latestValidRun(listed, "heldback");
  const building = buildingRef ? await resultRows(buildingRef.id) : [];
  const held = heldRef ? await resultRows(heldRef.id) : [];
  const heldRun = heldRef ? runs.find((row) => Number(row.id) === heldRef.id) : undefined;
  return NextResponse.json({
    buildingRun: buildingRef ? { id: buildingRef.id } : null,
    results: building,
    heldback: heldRef ? {
      run: {
        id: heldRef.id,
        finishedAt: heldRun?.finished_at ?? null,
        window: windowOf(heldRun?.params, heldRun?.data),
      },
      results: held,
    } : null,
    superseded: { label: SUPERSEDED_LONGTERM_LABEL, runIds: [...SUPERSEDED_LONGTERM_RUNS] },
  });
}

async function resultRows(runId: number) {
  const rows = await sql`
    SELECT variant, metrics, stresses
      FROM mlive.mlive_longterm_results
     WHERE run_id = ${runId}
       AND variant IN ('STATIC-MID', 'RADAR-MID')`;
  return (rows as unknown as { variant: string; metrics: unknown; stresses: unknown }[]).map((row) => ({
    variant: String(row.variant),
    metrics: objectOf(row.metrics),
    stresses: objectOf(row.stresses),
  }));
}

function windowOf(params: unknown, data: unknown): string {
  const source = { ...objectOf(params), ...objectOf(data) };
  const from = text(source.from) || text(source.first);
  const to = text(source.to) || text(source.last);
  if (from && to) return `${from}–${to}`;
  return "";
}

function objectOf(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return objectOf(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
