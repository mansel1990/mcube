import type { TradeForAnalytics } from "@/lib/stocks/portfolio-analytics";
import type { KiteTradeRow } from "@/lib/kite/trades";

/** Postgres TIMESTAMPTZ may arrive as Date — normalize to YYYY-MM-DD (IST). */
export function tradeEntryDate(createdAt: string | Date): string {
  if (createdAt instanceof Date) {
    return createdAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  const s = String(createdAt);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  return s.slice(0, 10);
}

export function tradeCreatedAtMs(createdAt: string | Date): number {
  return new Date(createdAt).getTime();
}

function entryDateFromTrade(trade: KiteTradeRow): string {
  return tradeEntryDate(trade.created_at);
}

/** Per-share entry price — legacy rows stored total INR in price. */
export function entryPricePerShare(trade: KiteTradeRow): number {
  const raw = Number(trade.price);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (trade.qty > 1 && raw > trade.qty * 50) return raw / trade.qty;
  return raw;
}

export function kiteTradeToAnalytics(trade: KiteTradeRow): TradeForAnalytics {
  const entryPrice = entryPricePerShare(trade);
  const exitPrice = trade.exit_price != null ? Number(trade.exit_price) : null;
  const quantity = trade.qty;
  const isClosed = trade.status === "CLOSED" && exitPrice != null && trade.exit_date;

  const realizedPnl =
    isClosed && exitPrice != null ? (exitPrice - entryPrice) * quantity : undefined;
  const realizedPnlPct =
    isClosed && exitPrice != null && entryPrice
      ? ((exitPrice - entryPrice) / entryPrice) * 100
      : undefined;

  return {
    status: isClosed ? "closed" : "open",
    entryDate: entryDateFromTrade(trade),
    exitDate: isClosed ? trade.exit_date : null,
    entryPrice,
    exitPrice: isClosed ? exitPrice : null,
    quantity,
    invested: quantity * entryPrice,
    realizedPnl,
    realizedPnlPct,
    source: trade.strategy ?? "kite",
    ticker: trade.symbol,
  };
}

export function kiteTradesToAnalytics(trades: KiteTradeRow[]): TradeForAnalytics[] {
  return trades.map(kiteTradeToAnalytics);
}
