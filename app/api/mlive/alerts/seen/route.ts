import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";

export async function POST() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await sql`UPDATE mlive.mlive_alerts SET seen_at = now() WHERE seen_at IS NULL`;
  return NextResponse.json({ ok: true });
}
