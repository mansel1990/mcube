import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const tickersParam = searchParams.get("tickers");
  if (!tickersParam) {
    return NextResponse.json({ error: "tickers param required" }, { status: 400 });
  }

  const tickers = tickersParam.split(",").map((t) => t.trim()).filter(Boolean);

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

  return NextResponse.json(results);
}
