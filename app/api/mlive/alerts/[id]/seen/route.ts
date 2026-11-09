import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";
import { alertSymbol, isMorningAlert } from "@/lib/mlive/rules";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const rows = await sql`SELECT code, symbol, message FROM mlive.mlive_alerts WHERE id = ${alertId}`;
  const code = rows[0]?.code == null ? null : String(rows[0].code);
  const symbol = alertSymbol(rows[0]?.symbol == null ? null : String(rows[0].symbol));
  const message = rows[0]?.message == null ? "" : String(rows[0].message);
  if (code && isMorningAlert(code)) {
    await sql`UPDATE mlive.mlive_alerts SET seen_at = now() WHERE code = ${code} AND seen_at IS NULL`;
  } else if (code && symbol) {
    await sql`UPDATE mlive.mlive_alerts SET seen_at = now() WHERE code = ${code} AND symbol = ${symbol} AND seen_at IS NULL`;
  } else if (code) {
    await sql`UPDATE mlive.mlive_alerts SET seen_at = now() WHERE code = ${code} AND message = ${message} AND seen_at IS NULL AND (symbol IS NULL OR btrim(symbol) = '')`;
  } else {
    await sql`UPDATE mlive.mlive_alerts SET seen_at = now() WHERE id = ${alertId} AND seen_at IS NULL`;
  }
  return NextResponse.json({ ok: true });
}
