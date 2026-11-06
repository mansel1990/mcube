import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";
import { userAudit } from "@/lib/mlive/write";

export async function POST() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await sql`
    INSERT INTO mlive.mlive_requests (kind, by_user)
    VALUES ('recheck', ${session.user.id})`;
  await userAudit({
    userId: session.user.id,
    action: "recheck.request",
    reason: "Re-check cash now",
  });
  return NextResponse.json({ ok: true });
}
