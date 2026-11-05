import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";
import { userAudit } from "@/lib/mlive/write";

export async function POST(request: Request) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { symbol?: string };
  const symbol = body.symbol?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  const rows = await sql`
    SELECT id, qty, frozen FROM mlive.mlive_positions
     WHERE symbol = ${symbol} AND closed_at IS NULL`;
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "No open system position" }, { status: 404 });
  if (row.frozen !== true) return NextResponse.json({ error: "Only a frozen position can be marked sold here" }, { status: 409 });
  await sql`
    UPDATE mlive.mlive_positions
       SET qty = 0, frozen = false, closed_at = now()
     WHERE id = ${row.id}`;
  await userAudit({
    userId: session.user.id,
    action: "position.marked_sold",
    symbol,
    before: { qty: row.qty },
    reason: "Marked sold manually after Kite quantity was below the system",
  });
  return NextResponse.json({ ok: true });
}
