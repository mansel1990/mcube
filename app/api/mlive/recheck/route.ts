import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";
import { recheckPoll, recheckRequestPlan } from "@/lib/mlive/recheck";
import { userAudit } from "@/lib/mlive/write";

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function summaryOf(value: unknown): { rechecked?: unknown } {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as { rechecked?: unknown };
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as { rechecked?: unknown }) : {};
}

export async function GET(request: Request) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const rows = await sql`
    SELECT done_at FROM mlive.mlive_requests
     WHERE id = ${id} AND kind = 'recheck'`;
  const rawDone = rows[0]?.done_at;
  const doneAt = rawDone == null ? null : rawDone instanceof Date ? rawDone.toISOString() : new Date(String(rawDone)).toISOString();
  if (!doneAt) return NextResponse.json(recheckPoll(null, null));
  const runs = await sql`
    SELECT summary FROM mlive.mlive_runs
     WHERE kind = 'approvals' AND status = 'ok'
     ORDER BY id DESC
     LIMIT 1`;
  return NextResponse.json(recheckPoll(doneAt, num(summaryOf(runs[0]?.summary).rechecked)));
}

export async function POST() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const open = await sql`
    SELECT id FROM mlive.mlive_requests
     WHERE kind = 'recheck' AND done_at IS NULL
     ORDER BY id
     LIMIT 1`;
  const inserted = open[0]
    ? []
    : await sql`
        INSERT INTO mlive.mlive_requests (kind, by_user)
        VALUES ('recheck', ${session.user.id})
        RETURNING id`;
  const plan = recheckRequestPlan(open[0] ? num(open[0].id) : null, num(inserted[0]?.id));
  if (plan.inserted) {
    await userAudit({
      userId: session.user.id,
      action: "recheck.request",
      reason: "Re-check cash now",
    });
  }
  return NextResponse.json({ ok: true, id: plan.id });
}
