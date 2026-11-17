import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { requireMliveSession } from "@/lib/mlive/auth";
import { kiteSessionStatus } from "@/lib/mlive/kite-session";
import { cashPicture, reviewDate, settingsMap } from "@/lib/mlive/read";
import { addDays, todayIst } from "@/lib/mlive/calendar";
import { applyDueSettings, queueOrSave, settingAllowed } from "@/lib/mlive/write";

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await applyDueSettings(todayIst(), session.user.id);
  const settings = await settingsMap();
  const anchor = String(settings.review_anchor_date ?? "2026-11-05").replace(/"/g, "");
  const days = Number(settings.review_every_days ?? 60);
  const [stateRows, kite, runs, cash] = await Promise.all([
    sql`SELECT status, mode, halt_reason FROM mlive.mlive_state WHERE id = 1`,
    kiteSessionStatus(),
    sql`SELECT kind, status, finished_at FROM mlive.mlive_runs ORDER BY id DESC LIMIT 1`,
    cashPicture(),
  ]);
  return NextResponse.json({
    settings,
    nextReview: reviewDate(anchor, days),
    state: stateRows[0] ?? null,
    kite,
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
  const body = (await request.json()) as { key?: string; value?: unknown; changes?: Record<string, unknown> };
  const changes = body.changes ?? (body.key ? { [body.key]: body.value } : {});
  const today = todayIst();
  const nextDay = addDays(today, 1);
  const queued: string[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (!settingAllowed(key)) return NextResponse.json({ error: "That setting cannot be changed here" }, { status: 400 });
    try {
      const when = await queueOrSave(key, value, session.user.id, nextDay);
      if (when === "next") queued.push(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  return NextResponse.json({ ok: true, queued });
}
