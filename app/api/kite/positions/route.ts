import { NextResponse } from "next/server";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { getKiteClientForUser } from "@/lib/kite/client";

export async function GET() {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kite, error } = await getKiteClientForUser(session.user.id);
  if (!kite) {
    return NextResponse.json(
      { error: error === "not_connected" ? "Kite not connected" : "Token expired" },
      { status: 401 }
    );
  }

  try {
    const positions = await kite.getPositions();
    return NextResponse.json(positions);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch positions";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
