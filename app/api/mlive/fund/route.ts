import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { recordFund } from "@/lib/mlive/write";

export async function POST(request: Request) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { kind?: string; amount?: number; note?: string };
  if (body.kind !== "deposit" && body.kind !== "withdrawal") {
    return NextResponse.json({ error: "kind must be deposit or withdrawal" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!(amount > 0)) return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  try {
    await recordFund(body.kind, amount, session.user.id, body.note || body.kind);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
