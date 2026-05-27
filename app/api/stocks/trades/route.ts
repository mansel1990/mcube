import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { UserTrade } from "@/lib/models/user-trade";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

async function requireStocksSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return null;
  }
  return session;
}

async function fetchPrices(tickers: string[]) {
  const results: Record<string, { price: number; change: number; changePct: number } | null> = {};
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const quote = await yahooFinance.quote(`${ticker}.NS`, {
          fields: ["regularMarketPrice", "regularMarketChange", "regularMarketChangePercent"],
        });
        results[ticker] = {
          price: quote.regularMarketPrice ?? 0,
          change: quote.regularMarketChange ?? 0,
          changePct: quote.regularMarketChangePercent ?? 0,
        };
      } catch {
        results[ticker] = null;
      }
    })
  );
  return results;
}

function enrichTrade(
  trade: Record<string, unknown>,
  prices: Record<string, { price: number; change: number; changePct: number } | null>
) {
  const quantity = Number(trade.quantity);
  const entryPrice = Number(trade.entryPrice);
  const invested = quantity * entryPrice;

  if (trade.status === "closed") {
    const exitPrice = Number(trade.exitPrice);
    const realizedPnl = (exitPrice - entryPrice) * quantity;
    const realizedPnlPct = entryPrice ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
    return { ...trade, invested, realizedPnl, realizedPnlPct };
  }

  const live = prices[trade.ticker as string];
  if (!live) {
    return { ...trade, invested, currentValue: null, unrealizedPnl: null, unrealizedPnlPct: null };
  }

  const currentValue = live.price * quantity;
  const unrealizedPnl = (live.price - entryPrice) * quantity;
  const unrealizedPnlPct = entryPrice ? ((live.price - entryPrice) / entryPrice) * 100 : 0;
  return { ...trade, invested, currentValue, unrealizedPnl, unrealizedPnlPct, livePrice: live.price };
}

export async function GET(request: NextRequest) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = request.nextUrl.searchParams.get("status");
  await connectToDatabase();

  const filter: Record<string, unknown> = { userId: session.user.id };
  if (status === "open" || status === "closed") filter.status = status;

  const trades = await UserTrade.find(filter).sort({ createdAt: -1 }).lean();
  const openTickers = [...new Set(trades.filter((t) => t.status === "open").map((t) => t.ticker))];
  const prices = openTickers.length > 0 ? await fetchPrices(openTickers) : {};

  return NextResponse.json(trades.map((t) => enrichTrade({ ...t.toObject(), _id: String(t._id) }, prices)));
}

export async function POST(request: NextRequest) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { source, signalRef, ticker, quantity, entryPrice, entryDate, target, stopLoss, notes } = body;

  if (!source || !signalRef || !ticker || !quantity || !entryPrice || !entryDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await connectToDatabase();

  const existing = await UserTrade.findOne({
    userId: session.user.id,
    signalRef,
    status: "open",
  });
  if (existing) {
    return NextResponse.json({ error: "Already logged for this signal" }, { status: 409 });
  }

  const trade = await UserTrade.create({
    userId: session.user.id,
    source,
    signalRef,
    ticker,
    quantity: Number(quantity),
    entryPrice: Number(entryPrice),
    entryDate,
    target: target != null ? Number(target) : null,
    stopLoss: stopLoss != null ? Number(stopLoss) : null,
    notes: notes ?? null,
    status: "open",
  });

  return NextResponse.json(trade, { status: 201 });
}
