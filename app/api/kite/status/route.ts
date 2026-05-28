import { NextResponse } from "next/server";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { getKiteSession, isKiteTokenValid } from "@/lib/kite/session";

export async function GET() {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await getKiteSession(session.user.id);

  if (!row) {
    return NextResponse.json({ connected: false, expired: false });
  }

  const valid = isKiteTokenValid(row.token_date);
  return NextResponse.json({
    connected: valid,
    expired: !valid,
    tokenDate: row.token_date,
    connectedAt: row.connected_at,
  });
}
