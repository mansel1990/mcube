import { todayIst } from "@/lib/mlive/calendar";
import { num, q } from "../db";
import { MliveKite } from "../kite";
import { loadSettings } from "../load";
import { livePrice } from "../market";
import { longgameOrderAction, orderLimit } from "./suggest";

/** Reprices or cancels orders that already exist. It does not place a new order. */
export async function maintainLongGameOrders(now = new Date()): Promise<{ cancellationsRequested: number }> {
  let cancellationsRequested = 0;
  try {
    const settings = await loadSettings();
    const rows = await q<{
      id: string;
      kite_order_id: string;
      symbol: string;
      side: string;
      qty: unknown;
      filled_qty: unknown;
      limit_price: unknown;
      placed_at: string | null;
      last_reprice_at: string | null;
    }>(
      `SELECT o.id::text AS id, o.kite_order_id, o.symbol, o.side, o.qty, o.filled_qty, o.limit_price,
              o.placed_at, o.last_reprice_at
         FROM mlive.mlive_orders o
        WHERE o.book = 'longterm'
          AND o.kite_order_id IS NOT NULL
          AND o.status NOT IN ('FILLED', 'COMPLETE', 'CANCELLED', 'REJECTED')
          AND o.dry_run = $1`,
      [settings.dryRun]
    );
    if (rows.length === 0) return { cancellationsRequested };
    const kite = new MliveKite(settings.dryRun);
    for (const order of rows) {
      const action = longgameOrderAction(now, order.last_reprice_at, order.placed_at);
      if (action === "wait") continue;
      if (action === "cancel") {
        await kite.cancelOrder(order.kite_order_id);
        cancellationsRequested += 1;
        const key = `cancel:${order.id}:${todayIst()}`;
        await q(
          `INSERT INTO mlive.mlive_longgame_reconcile
             (symbol, kind, status, units, idempotency_key, note)
           VALUES ($1, 'reduction', 'needs_you', $2, $3, 'The 15:10 cancel left a remainder.')
           ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
          [order.symbol, Math.max(0, num(order.qty) - num(order.filled_qty)), key]
        );
        continue;
      }
      const side = order.side === "SELL" ? "SELL" : "BUY";
      const last = await livePrice(order.symbol);
      const tick = await kite.tickSize(order.symbol);
      const price = orderLimit(side, last, tick, last == null ? null : 0);
      if (price == null) continue;
      await kite.modifyOrder(order.kite_order_id, price);
      await q(`UPDATE mlive.mlive_orders SET limit_price = $2, last_reprice_at = $3, updated_at = now() WHERE id = $1`, [
        num(order.id),
        price,
        now,
      ]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("mlive_orders") && !message.includes("mlive_longgame_reconcile")) {
      console.error("long game watch skipped", message);
    }
  }
  return { cancellationsRequested };
}
