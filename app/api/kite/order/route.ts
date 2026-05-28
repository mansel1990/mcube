import { NextResponse } from "next/server";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { getKiteSession, isKiteTokenValid } from "@/lib/kite/session";
import { placeOrderViaRelay } from "@/lib/kite/relay";
import { insertKiteTrade } from "@/lib/kite/trades";
export async function POST(request: Request) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kiteSession = await getKiteSession(session.user.id);
  if (!kiteSession || !isKiteTokenValid(kiteSession.token_date)) {
    return NextResponse.json({ error: "Kite not connected or token expired" }, { status: 401 });
  }

  let body: {
    symbol?: string;
    transactionType?: "BUY" | "SELL";
    quantity?: number;
    signalRef?: string;
    strategy?: string;
    targetPrice?: number;
    stopLoss?: number;
    ltp?: number;
    lotSize?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const symbol = body.symbol?.trim().toUpperCase();
  const transactionType = body.transactionType;
  const qty = Math.floor(Number(body.quantity));

  if (!symbol || !transactionType || !["BUY", "SELL"].includes(transactionType)) {
    return NextResponse.json({ error: "symbol and transactionType (BUY|SELL) required" }, { status: 400 });
  }

  if (!Number.isFinite(qty) || qty < 1) {
    return NextResponse.json({ error: "quantity must be at least 1" }, { status: 400 });
  }

  const lotSize = Math.max(1, Math.floor(Number(body.lotSize) || 1));
  if (qty % lotSize !== 0) {
    return NextResponse.json({ error: `quantity must be a multiple of lot size (${lotSize})` }, { status: 400 });
  }

  const ltp = Number(body.ltp);
  const estimatedInr = Number.isFinite(ltp) && ltp > 0 ? qty * ltp : null;

  try {
    const { orderId } = await placeOrderViaRelay({
      accessToken: kiteSession.access_token,
      symbol,
      transactionType,
      quantity: qty,
      exchange: "NSE",
      product: "CNC",
      orderType: "MARKET",
    });

    const trade = await insertKiteTrade({
      userId: session.user.id,
      signalRef: body.signalRef,
      symbol,
      exchange: "NSE",
      kiteOrderId: orderId,
      orderType: transactionType,
      qty,
      price: estimatedInr ?? undefined,
      targetPrice: body.targetPrice,
      stopLoss: body.stopLoss,
      strategy: body.strategy,
    });

    return NextResponse.json({
      tradeId: trade.id,
      kiteOrderId: orderId,
      symbol,
      transactionType,
      qty,
      estimatedInr,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Order failed";
    const status =
      message.includes("KITE_RELAY") || message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
