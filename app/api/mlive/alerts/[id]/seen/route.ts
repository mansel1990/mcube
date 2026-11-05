import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  await sql`UPDATE mlive.mlive_alerts SET seen_at = now() WHERE id = ${alertId} AND seen_at IS NULL`;
  return NextResponse.json({ ok: true });
}
