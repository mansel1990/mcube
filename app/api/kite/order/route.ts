import { NextResponse } from "next/server";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { roundToTick, validateExitGtt } from "@/lib/kite/gtt-exit";
import { placeGttOcoViaRelay, placeOrderViaRelay, relaySupportsGtt } from "@/lib/kite/relay";
import { getKiteSession, isKiteTokenValid } from "@/lib/kite/session";
import { insertKiteTrade, setKiteTradeGttId } from "@/lib/kite/trades";

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
    limitPrice?: number;
    lotSize?: number;
    placeExitGtt?: boolean;
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
  const limitPriceRaw = body.limitPrice != null ? Number(body.limitPrice) : ltp;
  const limitPrice =
    transactionType === "BUY" && Number.isFinite(limitPriceRaw) && limitPriceRaw > 0
      ? roundToTick(limitPriceRaw)
      : undefined;
  const estimatedInr =
    transactionType === "BUY" && limitPrice != null
      ? qty * limitPrice
      : Number.isFinite(ltp) && ltp > 0
        ? qty * ltp
        : null;
  const targetPrice = body.targetPrice != null ? Number(body.targetPrice) : undefined;
  const stopLoss = body.stopLoss != null ? Number(body.stopLoss) : undefined;
  const placeExitGtt = body.placeExitGtt !== false;

  if (transactionType === "BUY") {
    if (limitPrice == null) {
      return NextResponse.json({ error: "limitPrice required for buy" }, { status: 400 });
    }
    if (placeExitGtt) {
      if (targetPrice == null || stopLoss == null) {
        return NextResponse.json({ error: "Target and stop loss required for exit GTT" }, { status: 400 });
      }
      const gttRef = Number.isFinite(ltp) && ltp > 0 ? ltp : limitPrice;
      const gttErr = validateExitGtt(stopLoss, targetPrice, gttRef);
      if (gttErr) return NextResponse.json({ error: gttErr }, { status: 400 });
    }
  }

  try {
    const { orderId } = await placeOrderViaRelay({
      accessToken: kiteSession.access_token,
      symbol,
      transactionType,
      quantity: qty,
      exchange: "NSE",
      product: "CNC",
      orderType: transactionType === "BUY" ? "LIMIT" : "MARKET",
      ...(transactionType === "BUY" && limitPrice != null ? { price: limitPrice } : {}),
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
      targetPrice,
      stopLoss,
      strategy: body.strategy,
    });

    let gttTriggerId: string | null = null;
    let gttError: string | null = null;

    const gttLastPrice =
      Number.isFinite(ltp) && ltp > 0 ? ltp : limitPrice;

    if (
      transactionType === "BUY" &&
      placeExitGtt &&
      targetPrice != null &&
      stopLoss != null &&
      gttLastPrice != null &&
      gttLastPrice > 0
    ) {
      try {
        if (!(await relaySupportsGtt())) {
          throw new Error(
            "Relay missing /gtt endpoint — redeploy relay/server.mjs on the droplet and restart mcube-kite-relay"
          );
        }
        const { triggerId } = await placeGttOcoViaRelay({
          accessToken: kiteSession.access_token,
          symbol,
          exchange: "NSE",
          quantity: qty,
          lastPrice: gttLastPrice,
          stopLoss,
          target: targetPrice,
        });
        gttTriggerId = triggerId;
        await setKiteTradeGttId(trade.id, triggerId);
      } catch (err: unknown) {
        gttError = err instanceof Error ? err.message : "GTT placement failed";
      }
    }

    return NextResponse.json({
      tradeId: trade.id,
      kiteOrderId: orderId,
      symbol,
      transactionType,
      qty,
      estimatedInr,
      limitPrice: transactionType === "BUY" ? limitPrice : undefined,
      gttTriggerId,
      gttPlaced: gttTriggerId != null,
      gttError,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Order failed";
    const status =
      message.includes("KITE_RELAY") || message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
