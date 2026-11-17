import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { marketSql } from "@/lib/mlive/market";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  const runId = Number(params.get("run"));
  const strategy = params.get("strategy") ?? "";
  const paramsKey = params.get("params") ?? "";
  if (!Number.isFinite(runId) || !strategy || !paramsKey) {
    return NextResponse.json({ error: "Missing run, strategy, or params." }, { status: 400 });
  }
  const db = marketSql();
  if (!db) return NextResponse.json({ error: "The market database is not configured.", rows: [], total: 0, reasons: [] }, { status: 200 });
  const symbol = params.get("symbol")?.trim().toUpperCase() || null;
  const result = params.get("result") === "won" || params.get("result") === "lost" ? params.get("result") : null;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const csv = params.get("format") === "csv";
  const limit = csv ? 50000 : 40;
  const offset = csv ? 0 : (page - 1) * limit;
  try {
    const rows = await db`
      SELECT symbol, side, entry_ts, exit_ts, entry_px, exit_px, qty, gross, charges, net, net_pct, r, exit_reason, bars_held
        FROM research_trades
       WHERE run_id = ${runId} AND strategy = ${strategy} AND params_key = ${paramsKey}
         AND (${symbol}::text IS NULL OR symbol = ${symbol})
         AND (${result}::text IS NULL OR (${result} = 'won' AND net > 0) OR (${result} = 'lost' AND net <= 0))
       ORDER BY entry_ts, symbol
       LIMIT ${limit} OFFSET ${offset}`;
    const counts = await db`
      SELECT count(*)::int AS n
        FROM research_trades
       WHERE run_id = ${runId} AND strategy = ${strategy} AND params_key = ${paramsKey}
         AND (${symbol}::text IS NULL OR symbol = ${symbol})
         AND (${result}::text IS NULL OR (${result} = 'won' AND net > 0) OR (${result} = 'lost' AND net <= 0))`;
    const reasons = await db`
      SELECT exit_reason, count(*)::int AS n
        FROM research_trades
       WHERE run_id = ${runId} AND strategy = ${strategy} AND params_key = ${paramsKey}
       GROUP BY exit_reason
       ORDER BY n DESC`;
    if (csv) return new NextResponse(toCsv(rows as Record<string, unknown>[]), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    return NextResponse.json({
      rows: (rows as Record<string, unknown>[]).map(mapTrade),
      total: Number((counts[0] as { n?: number } | undefined)?.n ?? 0),
      page,
      reasons: (reasons as Record<string, unknown>[]).map((row) => ({ reason: String(row.exit_reason), n: Number(row.n ?? 0) })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("research_trades")) return NextResponse.json({ rows: [], total: 0, reasons: [], error: "No trades stored for this run." });
    throw error;
  }
}

function mapTrade(row: Record<string, unknown>) {
  return {
    symbol: String(row.symbol),
    side: String(row.side),
    entryTs: String(row.entry_ts),
    exitTs: String(row.exit_ts),
    entryPx: Number(row.entry_px),
    exitPx: Number(row.exit_px),
    qty: Number(row.qty),
    gross: Number(row.gross),
    charges: Number(row.charges),
    net: Number(row.net),
    netPct: Number(row.net_pct),
    r: row.r == null ? null : Number(row.r),
    exitReason: String(row.exit_reason),
    barsHeld: Number(row.bars_held),
  };
}

function toCsv(rows: Record<string, unknown>[]): string {
  const header = ["symbol", "side", "entry_ts", "exit_ts", "entry_px", "exit_px", "qty", "gross", "charges", "net", "net_pct", "r", "exit_reason", "bars_held"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => csv(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csv(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
