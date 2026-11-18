import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { LONGTERM_FROZEN_V2 } from "@/engine/longterm/rules";
import { longtermV2InputFromStored, scoreLongtermV2 } from "@/engine/longterm/score";
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
         AND status IN ('ok', 'queued', 'running')
       ORDER BY CASE WHEN status IN ('queued', 'running') THEN 0 ELSE 1 END, id DESC
       LIMIT 1`;
    const selected = runs[0] as RunRow | undefined;
    const runId = selected ? Number(selected.id) : null;
    const rows = runId == null
      ? []
      : await sql`
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

    const results = (rows as Record<string, unknown>[]).map(mapResult);
    return NextResponse.json({
      run: selected ? mapRun(selected) : null,
      results,
      comparisons: rescore(results),
      rules: LONGTERM_FROZEN_V2,
      locked: true,
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
