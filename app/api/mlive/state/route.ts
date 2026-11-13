import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";
import { userAudit } from "@/lib/mlive/write";

export async function POST(request: Request) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { pause?: boolean; resume?: boolean; mode?: string };
  const current = await sql`SELECT status, mode, halt_reason FROM mlive.mlive_state WHERE id = 1`;
  const before = current[0];
  if (!before) return NextResponse.json({ error: "mlive_state is missing" }, { status: 500 });

  let status = String(before.status);
  let mode = String(before.mode);
  let action = "state.change";
  if (body.pause) {
    status = "paused_by_user";
    mode = "paused";
    action = "pause";
  } else if (body.resume) {
    status = "active";
    mode = mode === "paused" ? "approve" : mode;
    action = "resume";
  } else if (body.mode === "approve" || body.mode === "auto" || body.mode === "paused") {
    mode = body.mode;
    status = body.mode === "paused" ? "paused_by_user" : status === "paused_by_user" ? "active" : status;
    action = "mode";
  } else {
    return NextResponse.json({ error: "Send pause, resume, or mode" }, { status: 400 });
  }

  await sql`UPDATE mlive.mlive_state SET status = ${status}, mode = ${mode}, halt_reason = ${action === "resume" ? null : before.halt_reason ?? null}, updated_at = now() WHERE id = 1`;
  await sql`
    INSERT INTO mlive.mlive_settings (key, value, updated_at, updated_by)
    VALUES ('mode', ${JSON.stringify(mode)}::jsonb, now(), ${session.user.id})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`;
  await userAudit({ userId: session.user.id, action, before, after: { status, mode } });
  return NextResponse.json({ ok: true, status, mode });
}
