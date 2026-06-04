import type { Connect } from "kiteconnect";
import { entryPricePerShare, tradeCreatedAtMs } from "@/lib/kite/kite-trade-analytics";
import {
  getClosedKiteBuysForUser,
  getOpenKiteBuysForUser,
  markKiteTradeClosed,
  markKiteTradeOpen,
  updateKiteTradeEntryPrice,
  type KiteTradeRow,
} from "./trades";

export interface KiteOrderLike {
  order_id: string;
  tradingsymbol: string;
  transaction_type: string;
  status: string;
  quantity: number;
  filled_quantity?: number;
  average_price: number;
  order_timestamp?: string | Date;
  exchange_update_timestamp?: string | Date;
}

export interface KiteHoldingLike {
  tradingsymbol: string;
  quantity: number;
}

/** Only count shares actually held — Kite may list 0-qty rows after partial data loads. */
export function positiveHoldingsMap(holdings: KiteHoldingLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const h of holdings) {
    if (h.quantity > 0) {
      map.set(h.tradingsymbol.toUpperCase(), h.quantity);
    }
  }
  return map;
}

function symbolListedInHoldings(holdings: KiteHoldingLike[], symbol: string): boolean {
  const sym = symbol.toUpperCase();
  return holdings.some((h) => h.tradingsymbol.toUpperCase() === sym);
}

/** Exit was guessed from SL/target, not an actual sell fill in the order book. */
export function wasInferredExit(trade: KiteTradeRow): boolean {
  const exit = Number(trade.exit_price);
  const sl = trade.stop_loss != null ? Number(trade.stop_loss) : null;
  const target = trade.target_price != null ? Number(trade.target_price) : null;
  if (sl && Number.isFinite(sl) && Math.abs(exit - sl) < 0.05) return true;
  if (target && Number.isFinite(target) && Math.abs(exit - target) < 0.05) return true;
  const entry = entryPricePerShare(trade);
  if (entry > 0 && Math.abs(exit - entry * 0.975) < 0.05) return true;
  return false;
}

function orderTimeMs(order: KiteOrderLike): number {
  const ts = order.exchange_update_timestamp ?? order.order_timestamp;
  if (!ts) return 0;
  return ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
}

function filledQty(order: KiteOrderLike): number {
  return order.filled_quantity ?? order.quantity;
}

function toIstDate(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function isCompleteOrder(o: KiteOrderLike): boolean {
  const s = o.status?.toUpperCase() ?? "";
  return s === "COMPLETE" || s === "TRADED";
}

function isSell(o: KiteOrderLike): boolean {
  return o.transaction_type?.toUpperCase() === "SELL";
}

function isBuy(o: KiteOrderLike): boolean {
  return o.transaction_type?.toUpperCase() === "BUY";
}

/**
 * Undo auto-closes that used estimated SL/target while the symbol is still in holdings.
 */
export async function reopenMisclosedKiteTrades(
  userId: string,
  holdings: KiteHoldingLike[]
): Promise<number> {
  const closed = await getClosedKiteBuysForUser(userId);
  let reopened = 0;

  for (const trade of closed) {
    const sym = trade.symbol.toUpperCase();
    const listed = symbolListedInHoldings(holdings, sym);
    const inferred = wasInferredExit(trade);

    // Still in Kite holdings (incl. 0-qty rows) but we only guessed exit from SL — undo.
    if (inferred && listed) {
      await markKiteTradeOpen(trade.id);
      reopened += 1;
    }
  }

  return reopened;
}

/** FIFO: which open buys no longer have enough holding qty to stay open (positive qty only). */
export function classifyOpenBuys(
  openBuys: KiteTradeRow[],
  holdings: KiteHoldingLike[]
): { stillOpen: KiteTradeRow[]; likelyClosed: KiteTradeRow[] } {
  const holdingMap = positiveHoldingsMap(holdings);

  const bySymbol = new Map<string, KiteTradeRow[]>();
  for (const buy of openBuys) {
    const sym = buy.symbol.toUpperCase();
    const list = bySymbol.get(sym) ?? [];
    list.push(buy);
    bySymbol.set(sym, list);
  }

  const stillOpen: KiteTradeRow[] = [];
  const likelyClosed: KiteTradeRow[] = [];

  for (const [, buys] of bySymbol) {
    const sym = buys[0]!.symbol.toUpperCase();
    let remaining = holdingMap.get(sym) ?? 0;
    const sorted = [...buys].sort(
      (a, b) => tradeCreatedAtMs(a.created_at) - tradeCreatedAtMs(b.created_at)
    );

    for (const buy of sorted) {
      if (remaining >= buy.qty) {
        remaining -= buy.qty;
        stillOpen.push(buy);
      } else {
        likelyClosed.push(buy);
        remaining = 0;
      }
    }
  }

  return { stillOpen, likelyClosed };
}

export function matchSellOrder(
  buy: KiteTradeRow,
  sellOrders: KiteOrderLike[],
  usedOrderIds: Set<string>
): KiteOrderLike | null {
  const sym = buy.symbol.toUpperCase();
  const buyTime = tradeCreatedAtMs(buy.created_at);

  const candidates = sellOrders
    .filter((o) => {
      if (usedOrderIds.has(o.order_id)) return false;
      if (o.tradingsymbol.toUpperCase() !== sym) return false;
      if (!isSell(o)) return false;
      if (!isCompleteOrder(o)) return false;
      if (filledQty(o) < buy.qty) return false;
      const ts = orderTimeMs(o);
      if (!ts || ts <= buyTime) return false;
      return true;
    })
    .sort((a, b) => orderTimeMs(a) - orderTimeMs(b));

  return candidates[0] ?? null;
}

function matchBuyOrder(
  buy: KiteTradeRow,
  buyOrders: KiteOrderLike[]
): KiteOrderLike | null {
  if (buy.kite_order_id) {
    const byId = buyOrders.find((o) => String(o.order_id) === String(buy.kite_order_id));
    if (byId && isCompleteOrder(byId) && byId.average_price > 0) return byId;
  }

  const sym = buy.symbol.toUpperCase();
  const candidates = buyOrders
    .filter(
      (o) =>
        o.tradingsymbol.toUpperCase() === sym &&
        isBuy(o) &&
        isCompleteOrder(o) &&
        filledQty(o) === buy.qty &&
        o.average_price > 0
    )
    .sort(
      (a, b) =>
        Math.abs(orderTimeMs(a) - tradeCreatedAtMs(buy.created_at)) -
        Math.abs(orderTimeMs(b) - tradeCreatedAtMs(buy.created_at))
    );

  return candidates[0] ?? null;
}

/**
 * Detect closed MCube Kite buys by comparing holdings + order history,
 * then persist exit price/date for realized P&L.
 */
export async function syncKiteTradesForUser(
  userId: string,
  kite: Connect,
  options?: { enrichFromUserTrades?: boolean }
): Promise<number> {
  const openBuys = await getOpenKiteBuysForUser(userId);
  if (openBuys.length === 0) return 0;

  if (options?.enrichFromUserTrades) {
    const { enrichOpenKiteBuysFromUserTrades } = await import("@/lib/kite/portfolio-realized");
    await enrichOpenKiteBuysFromUserTrades(userId, openBuys);
  }

  const [holdings, ordersRaw] = await Promise.all([kite.getHoldings(), kite.getOrders()]);
  const orders = ordersRaw as KiteOrderLike[];

  const completedBuys = orders.filter((o) => isBuy(o) && isCompleteOrder(o));
  const completedSells = orders.filter((o) => isSell(o) && isCompleteOrder(o));

  const closedBuyIds = new Set<number>();
  let closedCount = 0;

  // Match today's sell orders to open buys first (exact fill price).
  for (const sell of [...completedSells].sort((a, b) => orderTimeMs(a) - orderTimeMs(b))) {
    const sym = sell.tradingsymbol.toUpperCase();
    const candidates = openBuys
      .filter(
        (b) =>
          !closedBuyIds.has(b.id) &&
          b.symbol.toUpperCase() === sym &&
          filledQty(sell) >= b.qty
      )
      .sort((a, b) => tradeCreatedAtMs(a.created_at) - tradeCreatedAtMs(b.created_at));

    const buy = candidates[0];
    if (!buy || !(sell.average_price > 0)) continue;

    const exitTs = sell.exchange_update_timestamp ?? sell.order_timestamp;
    if (!exitTs) continue;

    closedBuyIds.add(buy.id);
    await markKiteTradeClosed(buy.id, sell.average_price, toIstDate(exitTs));
    closedCount += 1;
  }

  const stillOpen = openBuys.filter((b) => !closedBuyIds.has(b.id));
  if (stillOpen.length === 0) return closedCount;

  for (const buy of stillOpen) {
    const buyOrder = matchBuyOrder(buy, completedBuys);
    if (buyOrder?.average_price) {
      await updateKiteTradeEntryPrice(buy.id, buyOrder.average_price);
      buy.price = String(buyOrder.average_price);
    }
  }

  // Only close when a completed SELL exists in today's order book — never guess from SL.
  const { likelyClosed } = classifyOpenBuys(stillOpen, holdings);
  const usedSellIds = new Set<string>();

  for (const buy of likelyClosed) {
    const sell = matchSellOrder(buy, completedSells, usedSellIds);
    if (!sell?.average_price) continue;

    const exitTs = sell.exchange_update_timestamp ?? sell.order_timestamp;
    if (!exitTs) continue;

    usedSellIds.add(sell.order_id);
    await markKiteTradeClosed(buy.id, sell.average_price, toIstDate(exitTs));
    closedCount += 1;
  }

  return closedCount;
}
