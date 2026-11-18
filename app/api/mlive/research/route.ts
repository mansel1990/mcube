import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { intradayRetired, intradayRetiredSentence } from "@/lib/mlive/capabilities";
import { todayIst } from "@/lib/mlive/calendar";
import { engineSha } from "@/lib/mlive/engine-sha";
import { marketSql } from "@/lib/mlive/market";
import { loadNiftyCloses } from "@/lib/mlive/nifty";
import { heldbackBlock, RESEARCH_STRATEGIES, type ResearchBook, type ResearchSample } from "@/lib/mlive/research-bar";
import {
  dayMonth,
  duplicateBlock,
  effectiveStrategiesEnabled,
  identityFromRun,
  makeIdentity,
  queueBlock,
  type StoredRun,
} from "@/lib/mlive/research-page";
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

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const book: ResearchBook = request.nextUrl.searchParams.get("book") === "intraday" ? "intraday" : "swing";
  const runParam = request.nextUrl.searchParams.get("run");
  const wantBenchmark = request.nextUrl.searchParams.get("benchmark") === "1";
  try {
    const runs = await sql`
      SELECT id, book, sample, status, requested_at, started_at, finished_at, params, data, error, note, engine_sha
        FROM mlive.mlive_research_runs
       WHERE book = ${book}
       ORDER BY id DESC
       LIMIT 30`;
    const selected = runParam ? runs.find((row) => String(row.id) === runParam) ?? runs[0] : runs[0];
    const runId = selected ? Number(selected.id) : null;
    const [results, overlap, live, heldback, building, strategySetting] = await Promise.all([
      runId == null
        ? Promise.resolve([])
        : sql`
            SELECT strategy, params, params_key, is_default, trades, win_rate, profit_factor, avg_net_pct,
                   worst_drawdown_pct, longest_losing_run, half_years_profitable_pct, cagr_pct, exposure_pct,
                   monthly, equity, passed, fail_reasons
              FROM mlive.mlive_research_results
             WHERE run_id = ${runId}
             ORDER BY strategy, is_default DESC, params_key`,
      runId == null
        ? Promise.resolve([])
        : sql`SELECT a, b, loss_day_overlap FROM mlive.mlive_research_overlap WHERE run_id = ${runId} ORDER BY a, b`,
      sql`
        SELECT strategy,
               count(*) FILTER (WHERE closed_at IS NOT NULL)::int AS trades,
               AVG(realised_pnl / NULLIF(avg_price * qty, 0)) FILTER (WHERE closed_at IS NOT NULL) AS avg_net,
               min(opened_at) AS since
          FROM mlive.mlive_positions
         WHERE book = ${book} AND dry_run = false
         GROUP BY strategy
         ORDER BY strategy`,
      sql`
        SELECT COALESCE(NULLIF(r.params->>'variant', ''), r.strategy) AS strategy,
               max(u.finished_at) AS finished_at
          FROM mlive.mlive_research_results r
          JOIN mlive.mlive_research_runs u ON u.id = r.run_id
         WHERE u.book = ${book} AND u.sample = 'heldback' AND u.status = 'ok'
           AND (r.is_default OR NULLIF(r.params->>'variant', '') IS NOT NULL)
         GROUP BY COALESCE(NULLIF(r.params->>'variant', ''), r.strategy)`,
      sql`
        SELECT DISTINCT ON (r.strategy) r.strategy, r.avg_net_pct
          FROM mlive.mlive_research_results r
          JOIN mlive.mlive_research_runs u ON u.id = r.run_id
         WHERE u.book = ${book} AND u.sample = 'building' AND u.status = 'ok' AND r.is_default
         ORDER BY r.strategy, u.id DESC`,
      sql`SELECT value FROM mlive.mlive_settings WHERE key = 'strategies_enabled'`,
    ]);
    const sample = selected ? String((selected as RunRow).sample) : "";
    const note = selected ? String((selected as RunRow).note ?? "") : "";
    const mapped = (results as Record<string, unknown>[]).map((row) => ({ ...mapResult(row), sample, note }));
    const selectedRun = selected ? mapRun(selected as RunRow) : null;
    const window = paramsWindow(selectedRun?.params);
    const [sha, candle, benchmark] = await Promise.all([
      Promise.resolve(engineSha()),
      lastCandle(book),
      wantBenchmark && window ? loadNiftyCloses(window.from, window.to).then((loaded) => loaded.closes) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      engineSha: sha,
      lastCandle: candle,
      benchmark,
      runs: (runs as RunRow[]).map(mapRun),
      run: selectedRun,
      results: mapped,
      overlap: (overlap as Record<string, unknown>[]).map((row) => ({
        a: String(row.a),
        b: String(row.b),
        overlap: Number(row.loss_day_overlap ?? 0),
      })),
      live: (live as Record<string, unknown>[]).map((row) => ({
        strategy: String(row.strategy),
        trades: Number(row.trades ?? 0),
        avgNet: row.avg_net == null ? null : Number(row.avg_net),
        since: stamp(row.since),
      })),
      building: (building as Record<string, unknown>[]).map((row) => ({
        strategy: String(row.strategy),
        avgNetPct: row.avg_net_pct == null ? null : Number(row.avg_net_pct),
      })),
      heldback: (heldback as Record<string, unknown>[]).map((row) => ({
        strategy: String(row.strategy),
        at: stamp(row.finished_at),
      })),
      strategiesEnabled: effectiveStrategiesEnabled(strategySetting[0]?.value),
      retiredIntraday: intradayRetiredSentence((await sql`
        SELECT u.id, u.sample, r.strategy, r.profit_factor, r.trades
          FROM mlive.mlive_research_results r
          JOIN mlive.mlive_research_runs u ON u.id = r.run_id
         WHERE u.book = 'intraday' AND u.status = 'ok' AND r.strategy IN ('orb', 'vwap')
         ORDER BY u.id DESC`).map((row) => ({
        runId: Number(row.id),
        sample: String(row.sample),
        strategy: String(row.strategy),
        profitFactor: Number(row.profit_factor),
        trades: Number(row.trades),
      }))),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("mlive_research_runs") || message.includes("mlive_research_results")) {
      return NextResponse.json({ error: "Research tables are not there yet. Run scripts/sql/mlive/009_research.sql." }, { status: 503 });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { book?: string; strategies?: string[]; sample?: string; confirmHeldback?: boolean; force?: boolean; grid?: boolean } | null;
  const book: ResearchBook = body?.book === "intraday" ? "intraday" : body?.book === "swing" ? "swing" : "swing";
  if (body?.book !== "swing" && body?.book !== "intraday") return NextResponse.json({ error: "Choose swing or intraday." }, { status: 400 });
  if (book === "intraday") {
    const flag = await sql`SELECT value FROM mlive.mlive_settings WHERE key = 'intraday_retired'`;
    if (intradayRetired(flag[0]?.value)) return NextResponse.json({ error: "Intraday is retired." }, { status: 400 });
  }
  const allowed = new Set(RESEARCH_STRATEGIES[book]);
  const strategies = (body.strategies ?? []).filter((name) => allowed.has(name));
  if (strategies.length === 0) return NextResponse.json({ error: "Pick at least one strategy." }, { status: 400 });
  if (body.sample === "diagnostic") {
    return NextResponse.json({ error: "A diagnostic run has no official verdict and is not queued from this page." }, { status: 400 });
  }
  const sample: ResearchSample = body.sample === "heldback" ? "heldback" : "building";
  const confirmHeldback = body.confirmHeldback === true;
  const force = body.force === true;
  const grid = body.grid !== false;
  if (sample === "heldback" && !confirmHeldback) {
    return NextResponse.json({ error: "Confirm held-back before queueing." }, { status: 400 });
  }
  if (sample === "heldback") {
    const used = await sql`
      SELECT r.strategy, max(u.finished_at) AS finished_at
        FROM mlive.mlive_research_results r
        JOIN mlive.mlive_research_runs u ON u.id = r.run_id
       WHERE u.book = ${book} AND u.sample = 'heldback' AND u.status = 'ok' AND r.is_default
         AND r.strategy = ANY(${strategies}::text[])
       GROUP BY r.strategy`;
    const blocked = heldbackBlock(used.map((row) => String(row.strategy)), strategies, force);
    if (blocked) {
      const when = used.map((row) => stamp(row.finished_at)).find((value) => value);
      const message = when ? `Held-back used on ${dayMonth(when)}.` : blocked;
      return NextResponse.json({ error: message }, { status: 409 });
    }
  }
  const sha = engineSha();
  const candle = await lastCandle(book);
  const identity = makeIdentity({ book, sample, strategies, grid, engineSha: sha, lastCandle: candle });
  const prior = await sql`
    SELECT id, status, sample, finished_at, params, data, engine_sha
      FROM mlive.mlive_research_runs
     WHERE book = ${book} AND status IN ('ok', 'queued', 'running')
     ORDER BY id DESC
     LIMIT 200`;
  const stored: StoredRun[] = (prior as Record<string, unknown>[]).map((row) => ({
    id: Number(row.id),
    status: String(row.status),
    finishedAt: stamp(row.finished_at),
    identity: identityFromRun({
      book,
      sample: String(row.sample ?? ""),
      params: row.params,
      engineSha: row.engine_sha == null ? "" : String(row.engine_sha),
      dataLast: dataLastOf(row.data),
    }),
  }));
  const blocked = duplicateBlock(identity, stored, force) ?? queueBlock(identity, stored);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
  const inserted = await sql`
    INSERT INTO mlive.mlive_research_runs (book, sample, status, requested_by, params, engine_sha)
    VALUES (${book}, ${sample}, 'queued', ${session.user.id}, ${JSON.stringify({ strategies, grid, sample, identity })}::jsonb, ${sha})
    RETURNING id`;
  const runId = Number(inserted[0]?.id);
  await sql`
    INSERT INTO mlive.mlive_requests (kind, by_user, payload)
    VALUES ('research', ${session.user.id}, ${JSON.stringify({ runId, book, strategies, sample, confirmHeldback, force, grid })}::jsonb)`;
  return NextResponse.json({ ok: true, id: runId });
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
  const avg = row.avg_net_pct == null ? null : Number(row.avg_net_pct);
  return {
    strategy: String(row.strategy),
    sample: "",
    params: objectOf(row.params),
    paramsKey: String(row.params_key ?? "default"),
    isDefault: row.is_default === true,
    trades: Number(row.trades ?? 0),
    winRate: row.win_rate == null ? null : Number(row.win_rate),
    profitFactor: row.profit_factor == null ? null : Number(row.profit_factor),
    avgNetPct: avg,
    averageNet: avg == null ? null : avg / 100,
    worstDrawdownPct: row.worst_drawdown_pct == null ? null : Number(row.worst_drawdown_pct),
    worstDrawdown: row.worst_drawdown_pct == null ? null : Number(row.worst_drawdown_pct) / 100,
    longestLosingRun: row.longest_losing_run == null ? null : Number(row.longest_losing_run),
    halfYearsPct: row.half_years_profitable_pct == null ? null : Number(row.half_years_profitable_pct),
    cagrPct: row.cagr_pct == null ? null : Number(row.cagr_pct),
    exposurePct: row.exposure_pct == null ? null : Number(row.exposure_pct),
    monthly: objectOf(row.monthly),
    equity: Array.isArray(row.equity) ? row.equity : objectOf(row.equity),
    passed: row.passed === true,
    failReasons: Array.isArray(row.fail_reasons) ? row.fail_reasons.map(String) : [],
    note: "",
  };
}

function objectOf(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function dataLastOf(data: unknown): string | null {
  const row = objectOf(data);
  return typeof row.last === "string" ? row.last : null;
}

async function lastCandle(book: ResearchBook): Promise<string> {
  if (book === "intraday") return todayIst();
  const market = marketSql();
  if (!market) return "";
  try {
    const rows = await market`SELECT max(ts)::text AS ts FROM candles_daily`;
    const ts = rows[0]?.ts;
    return ts ? String(ts).slice(0, 10) : "";
  } catch {
    return "";
  }
}

function paramsWindow(params: Record<string, unknown> | undefined): { from: string; to: string } | null {
  const window = params?.window;
  if (!window || typeof window !== "object") return null;
  const row = window as { from?: unknown; to?: unknown };
  if (typeof row.from !== "string" || typeof row.to !== "string") return null;
  return { from: row.from, to: row.to };
}

function stamp(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return text || null;
}
