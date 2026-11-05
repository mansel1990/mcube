import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { nextTradingDay, todayIst } from "@/lib/mlive/calendar";
import { canApproveDecision } from "@/lib/mlive/rules";
import { requireMliveSession } from "@/lib/mlive/auth";
import { userAudit } from "@/lib/mlive/write";

export async function POST(request: Request) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { decision_id?: number; action?: string };
  const action = body.action === "approve" ? "approve" : body.action === "skip" ? "skip" : null;
  if (!action || !body.decision_id) return NextResponse.json({ error: "decision_id and action are required" }, { status: 400 });
  const rows = await sql`SELECT id, symbol, outcome, dry_run, trade_date::text AS trade_date FROM mlive.mlive_decisions WHERE id = ${body.decision_id}`;
  const row = rows[0];
  const holidays = await sql`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`;
  const today = todayIst();
  const next = nextTradingDay(today, new Set(holidays.map((item) => String(item.trade_date).slice(0, 10))));
  const tradeDate = String(row?.trade_date ?? "").slice(0, 10);
  if (!row || !canApproveDecision({ outcome: String(row.outcome), tradeDate, today, next, dryRun: row.dry_run === true })) {
    return NextResponse.json({ error: "That decision is not waiting" }, { status: 409 });
  }
  await sql`
    INSERT INTO mlive.mlive_approvals (decision_id, action, by_user) VALUES (${body.decision_id}, ${action}, ${session.user.id})`;
  await sql`
    UPDATE mlive.mlive_decisions SET outcome = ${action === "approve" ? "approved" : "skipped"} WHERE id = ${body.decision_id}`;
  await userAudit({
    userId: session.user.id,
    action: `approval.${action}`,
    symbol: String(row.symbol),
    after: { decision_id: body.decision_id },
  });
  return NextResponse.json({ ok: true });
}
