import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";
import { userAudit } from "@/lib/mlive/write";

export async function POST() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await sql`DELETE FROM mlive.mlive_kite_sessions WHERE user_id = ${session.user.id}`;
  await userAudit({ userId: session.user.id, action: "kite.disconnect" });
  return NextResponse.json({ ok: true });
}
