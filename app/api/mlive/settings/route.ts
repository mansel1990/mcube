import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";
import { cashPicture, reviewDate, settingsMap } from "@/lib/mlive/read";
import { changeSetting, settingAllowed } from "@/lib/mlive/write";

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await settingsMap();
  const anchor = String(settings.review_anchor_date ?? "2026-11-05").replace(/"/g, "");
  const days = Number(settings.review_every_days ?? 60);
  const [stateRows, kiteRows, runs, cash] = await Promise.all([
    sql`SELECT status, mode FROM mlive.mlive_state WHERE id = 1`,
    sql`SELECT token_date, connected_at, kite_user_id FROM mlive.mlive_kite_sessions ORDER BY connected_at DESC LIMIT 1`,
    sql`SELECT kind, status, finished_at FROM mlive.mlive_runs ORDER BY id DESC LIMIT 1`,
    cashPicture(),
  ]);
  return NextResponse.json({
    settings,
    nextReview: reviewDate(anchor, days),
    state: stateRows[0] ?? null,
    kite: kiteRows[0] ?? null,
    kiteFunds: cash.kiteFunds,
    tradingLimit: cash.tradingLimit,
    engineCanUse: cash.engineCanUse,
    cashNote: cash.note,
    engine: runs[0] ?? null,
  });
}

export async function POST(request: Request) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { key?: string; value?: unknown };
  if (!body.key || !settingAllowed(body.key)) {
    return NextResponse.json({ error: "That setting cannot be changed here" }, { status: 400 });
  }
  await changeSetting(body.key, body.value, session.user.id);
  return NextResponse.json({ ok: true });
}
