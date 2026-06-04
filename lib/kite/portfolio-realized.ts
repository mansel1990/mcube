import { connectToDatabase } from "@/lib/mongodb";
import { UserTrade } from "@/lib/models/user-trade";
import type { TradeForAnalytics } from "@/lib/stocks/portfolio-analytics";
import type { KiteTradeRow } from "@/lib/kite/trades";

export function userTradeToAnalytics(trade: {
  ticker: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;
  exitPrice: number | null;
  exitDate: string | null;
  source: string;
}): TradeForAnalytics | null {
  if (trade.exitPrice == null || !trade.exitDate) return null;
  const quantity = trade.quantity;
  const entryPrice = trade.entryPrice;
  const exitPrice = trade.exitPrice;
  const realizedPnl = (exitPrice - entryPrice) * quantity;
  const realizedPnlPct = entryPrice ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;

  return {
    status: "closed",
    entryDate: trade.entryDate,
    exitDate: trade.exitDate,
    entryPrice,
    exitPrice,
    quantity,
    invested: quantity * entryPrice,
    realizedPnl,
    realizedPnlPct,
    source: trade.source,
    ticker: trade.ticker,
  };
}

/** Fill missing SL/target on open kite rows from optional manual logs. */
export async function enrichOpenKiteBuysFromUserTrades(
  userId: string,
  openBuys: KiteTradeRow[]
): Promise<void> {
  const needsEnrich = openBuys.filter((b) => !b.stop_loss && !b.target_price && b.signal_ref);
  if (needsEnrich.length === 0) return;

  await connectToDatabase();
  for (const buy of needsEnrich) {
    const logged = await UserTrade.findOne({
      userId,
      signalRef: buy.signal_ref!,
    }).lean();
    if (!logged) continue;
    if (logged.stopLoss != null) buy.stop_loss = String(logged.stopLoss);
    if (logged.target != null) buy.target_price = String(logged.target);
  }
}

export async function getClosedLoggedTradesForUser(userId: string): Promise<TradeForAnalytics[]> {
  await connectToDatabase();
  const rows = await UserTrade.find({ userId, status: "closed" }).lean();
  const out: TradeForAnalytics[] = [];
  for (const row of rows) {
    const t = userTradeToAnalytics({
      ticker: row.ticker,
      quantity: row.quantity,
      entryPrice: row.entryPrice,
      entryDate: row.entryDate,
      exitPrice: row.exitPrice,
      exitDate: row.exitDate,
      source: row.source,
    });
    if (t) out.push(t);
  }
  return out;
}

/** Prefer kite; add manual logs not already represented by signal_ref. */
export function mergeRealizedTrades(
  kite: TradeForAnalytics[],
  logged: TradeForAnalytics[],
  kiteRows: KiteTradeRow[]
): TradeForAnalytics[] {
  const kiteSignals = new Set(
    kiteRows.map((r) => r.signal_ref).filter((s): s is string => !!s)
  );
  const merged = [...kite];
  for (const t of logged) {
    const ref = (t as TradeForAnalytics & { signalRef?: string }).signalRef;
    if (ref && kiteSignals.has(ref)) continue;
    merged.push(t);
  }
  return merged;
}

/** Undo logged trades that were auto-closed from estimated SL while still in Kite holdings. */
export async function reopenMisclosedLoggedTrades(
  userId: string,
  holdings: { tradingsymbol: string; quantity: number }[]
): Promise<number> {
  await connectToDatabase();
  const closed = await UserTrade.find({ userId, status: "closed" });
  let reopened = 0;

  for (const t of closed) {
    const sym = t.ticker.toUpperCase();
    const listed = holdings.some((h) => h.tradingsymbol.toUpperCase() === sym);
    if (!listed || t.exitPrice == null) continue;

    const slInferred =
      t.stopLoss != null && Math.abs(t.exitPrice - t.stopLoss) < 0.05;
    const pctInferred =
      t.entryPrice > 0 && Math.abs(t.exitPrice - t.entryPrice * 0.975) < 0.05;
    if (!slInferred && !pctInferred) continue;

    t.status = "open";
    t.exitPrice = null;
    t.exitDate = null;
    await t.save();
    reopened += 1;
  }

  return reopened;
}
