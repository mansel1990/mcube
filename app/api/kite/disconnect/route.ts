import { NextResponse } from "next/server";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { deleteKiteSession } from "@/lib/kite/session";

export async function POST() {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await deleteKiteSession(session.user.id);
  return NextResponse.json({ ok: true });
}
