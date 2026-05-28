import { NextResponse } from "next/server";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { getKiteSession, isKiteTokenValid } from "@/lib/kite/session";
import { cancelOrderViaRelay } from "@/lib/kite/relay";
import {
  getKiteTradeForUser,
  isWithinCancelWindow,
  markKiteTradeCancelled,
  KITE_CANCEL_WINDOW_SEC,
} from "@/lib/kite/trades";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tradeId = Number(id);
  if (!Number.isFinite(tradeId)) {
    return NextResponse.json({ error: "Invalid trade id" }, { status: 400 });
  }

  const kiteSession = await getKiteSession(session.user.id);
  if (!kiteSession || !isKiteTokenValid(kiteSession.token_date)) {
    return NextResponse.json({ error: "Kite not connected or token expired" }, { status: 401 });
  }

  const trade = await getKiteTradeForUser(tradeId, session.user.id);
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (trade.status === "CANCELLED") {
    return NextResponse.json({ error: "Order already cancelled" }, { status: 409 });
  }

  if (!isWithinCancelWindow(trade.created_at)) {
    return NextResponse.json(
      { error: `Cancel window expired (${KITE_CANCEL_WINDOW_SEC}s)` },
      { status: 409 }
    );
  }

  if (!trade.kite_order_id) {
    return NextResponse.json({ error: "No Kite order id on record" }, { status: 400 });
  }

  try {
    await cancelOrderViaRelay({
      accessToken: kiteSession.access_token,
      orderId: trade.kite_order_id,
    });
    await markKiteTradeCancelled(tradeId);
    return NextResponse.json({ ok: true, tradeId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Cancel failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
