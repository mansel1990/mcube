import { sql } from "@/lib/sql";

let tradesMigrated = false;

export async function ensureKiteTradesSchema() {
  if (tradesMigrated) return;
  await sql`
    CREATE TABLE IF NOT EXISTS kite_trades (
      id            SERIAL PRIMARY KEY,
      user_id       TEXT NOT NULL,
      signal_ref    TEXT,
      symbol        TEXT NOT NULL,
      exchange      TEXT NOT NULL,
      kite_order_id TEXT,
      kite_gtt_id   TEXT,
      order_type    TEXT NOT NULL,
      qty           INTEGER NOT NULL,
      price         NUMERIC(10,2),
      target_price  NUMERIC(10,2),
      stop_loss     NUMERIC(10,2),
      status        TEXT DEFAULT 'OPEN',
      strategy      TEXT,
      created_at    TIMESTAMPTZ DEFAULT now(),
      closed_at     TIMESTAMPTZ,
      exit_price    NUMERIC(10,2),
      exit_date     TEXT
    )
  `;
  await sql`ALTER TABLE kite_trades ADD COLUMN IF NOT EXISTS kite_gtt_id TEXT`;
  await sql`ALTER TABLE kite_trades ADD COLUMN IF NOT EXISTS exit_price NUMERIC(10,2)`;
  await sql`ALTER TABLE kite_trades ADD COLUMN IF NOT EXISTS exit_date TEXT`;
  tradesMigrated = true;
}

export interface KiteTradeRow {
  id: number;
  user_id: string;
  signal_ref: string | null;
  symbol: string;
  exchange: string;
  kite_order_id: string | null;
  kite_gtt_id: string | null;
  order_type: string;
  qty: number;
  price: string | null;
  target_price: string | null;
  stop_loss: string | null;
  status: string;
  strategy: string | null;
  created_at: string | Date;
  closed_at: string | Date | null;
  exit_price: string | null;
  exit_date: string | null;
}

export async function insertKiteTrade(params: {
  userId: string;
  signalRef?: string;
  symbol: string;
  exchange: string;
  kiteOrderId: string;
  orderType: "BUY" | "SELL";
  qty: number;
  price?: number;
  targetPrice?: number;
  stopLoss?: number;
  strategy?: string;
}): Promise<KiteTradeRow> {
  await ensureKiteTradesSchema();
  const rows = await sql`
    INSERT INTO kite_trades (
      user_id, signal_ref, symbol, exchange, kite_order_id,
      order_type, qty, price, target_price, stop_loss, strategy, status
    ) VALUES (
      ${params.userId},
      ${params.signalRef ?? null},
      ${params.symbol},
      ${params.exchange},
      ${params.kiteOrderId},
      ${params.orderType},
      ${params.qty},
      ${params.price ?? null},
      ${params.targetPrice ?? null},
      ${params.stopLoss ?? null},
      ${params.strategy ?? null},
      'OPEN'
    )
    RETURNING *
  `;
  return rows[0] as KiteTradeRow;
}

export async function getKiteTradeForUser(tradeId: number, userId: string): Promise<KiteTradeRow | null> {
  await ensureKiteTradesSchema();
  const rows = await sql`
    SELECT * FROM kite_trades WHERE id = ${tradeId} AND user_id = ${userId}
  `;
  return (rows[0] as KiteTradeRow | undefined) ?? null;
}

export async function setKiteTradeGttId(tradeId: number, gttId: string): Promise<void> {
  await ensureKiteTradesSchema();
  await sql`
    UPDATE kite_trades SET kite_gtt_id = ${gttId} WHERE id = ${tradeId}
  `;
}

export async function markKiteTradeCancelled(tradeId: number): Promise<void> {
  await ensureKiteTradesSchema();
  await sql`
    UPDATE kite_trades
    SET status = 'CANCELLED', closed_at = now()
    WHERE id = ${tradeId}
  `;
}

export async function getOpenKiteBuysForUser(userId: string): Promise<KiteTradeRow[]> {
  await ensureKiteTradesSchema();
  const rows = await sql`
    SELECT * FROM kite_trades
    WHERE user_id = ${userId}
      AND order_type = 'BUY'
      AND status = 'OPEN'
    ORDER BY created_at ASC
  `;
  return rows as KiteTradeRow[];
}

export async function getClosedKiteBuysForUser(userId: string): Promise<KiteTradeRow[]> {
  await ensureKiteTradesSchema();
  const rows = await sql`
    SELECT * FROM kite_trades
    WHERE user_id = ${userId}
      AND order_type = 'BUY'
      AND status = 'CLOSED'
    ORDER BY COALESCE(exit_date, closed_at::text) ASC
  `;
  return rows as KiteTradeRow[];
}

export async function updateKiteTradeEntryPrice(tradeId: number, pricePerShare: number): Promise<void> {
  await ensureKiteTradesSchema();
  await sql`
    UPDATE kite_trades SET price = ${pricePerShare} WHERE id = ${tradeId}
  `;
}

export async function markKiteTradeClosed(
  tradeId: number,
  exitPrice: number,
  exitDate: string
): Promise<void> {
  await ensureKiteTradesSchema();
  await sql`
    UPDATE kite_trades
    SET status = 'CLOSED',
        exit_price = ${exitPrice},
        exit_date = ${exitDate},
        closed_at = now()
    WHERE id = ${tradeId}
  `;
}

export async function markKiteTradeOpen(tradeId: number): Promise<void> {
  await ensureKiteTradesSchema();
  await sql`
    UPDATE kite_trades
    SET status = 'OPEN',
        exit_price = NULL,
        exit_date = NULL,
        closed_at = NULL
    WHERE id = ${tradeId}
  `;
}

/** Cancel window after order placement (seconds). */
export const KITE_CANCEL_WINDOW_SEC = 5;

export function isWithinCancelWindow(createdAt: string | Date): boolean {
  const placed = new Date(createdAt).getTime();
  return Date.now() - placed <= KITE_CANCEL_WINDOW_SEC * 1000;
}
