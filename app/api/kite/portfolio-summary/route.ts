import { NextResponse } from "next/server";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { getKiteClientForUser } from "@/lib/kite/client";
import { reopenMisclosedKiteTrades, syncKiteTradesForUser } from "@/lib/kite/sync-trades";
import { getClosedKiteBuysForUser } from "@/lib/kite/trades";
import { kiteTradesToAnalytics } from "@/lib/kite/kite-trade-analytics";
import {
  getClosedLoggedTradesForUser,
  mergeRealizedTrades,
  reopenMisclosedLoggedTrades,
} from "@/lib/kite/portfolio-realized";
import {
  computePortfolioSummary,
  filterTradesForTracking,
} from "@/lib/stocks/portfolio-analytics";

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
    const holdings = (await kite.getHoldings()) as { tradingsymbol: string; quantity: number }[];

    await reopenMisclosedKiteTrades(session.user.id, holdings);
    await reopenMisclosedLoggedTrades(session.user.id, holdings);
    await syncKiteTradesForUser(session.user.id, kite, { enrichFromUserTrades: true });

    const [closedKiteRows, closedLogged] = await Promise.all([
      getClosedKiteBuysForUser(session.user.id),
      getClosedLoggedTradesForUser(session.user.id),
    ]);

    const kiteAnalytics = kiteTradesToAnalytics(closedKiteRows);
    const merged = mergeRealizedTrades(kiteAnalytics, closedLogged, closedKiteRows);
    const tracked = filterTradesForTracking(merged);
    const summary = computePortfolioSummary(tracked);

    return NextResponse.json({
      trades: tracked,
      summary,
      sources: {
        kiteClosed: closedKiteRows.length,
        loggedClosed: closedLogged.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to compute portfolio P&L";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
