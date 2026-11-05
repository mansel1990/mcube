import { KiteConnect, type Connect, type GTTParams } from "kiteconnect";
import { decryptToken } from "@/lib/mlive/crypto";
import { todayIst } from "@/lib/mlive/calendar";
import { asDate, q } from "./db";

export type KiteHolding = { tradingsymbol: string; quantity: number };
export type KiteOrder = {
  order_id: string;
  status: string;
  filled_quantity: number;
  average_price: number;
  tag?: string | null;
  status_message?: string | null;
  tradingsymbol: string;
  transaction_type: string;
};
export type Placed = { orderId: string; dryRun: boolean };

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await sleep(400 * (attempt + 1));
    }
  }
  const message = last instanceof Error ? last.message : String(last);
  throw new Error(`${label} failed: ${message}`);
}

export class MliveKite {
  constructor(private readonly dryRun: boolean) {}

  private async client(): Promise<Connect> {
    const apiKey = process.env.KITE_API_KEY;
    const tokenKey = process.env.MLIVE_TOKEN_KEY;
    if (!apiKey) throw new Error("KITE_API_KEY is not set");
    if (!tokenKey) throw new Error("MLIVE_TOKEN_KEY is not set");
    const rows = await q<{ access_token_enc: string; token_date: unknown }>(
      `SELECT access_token_enc, token_date FROM mlive.mlive_kite_sessions ORDER BY connected_at DESC LIMIT 1`
    );
    const row = rows[0];
    if (!row || asDate(row.token_date) !== todayIst()) throw new Error("no Kite session for today");
    const kc = new KiteConnect({ api_key: apiKey });
    kc.setAccessToken(decryptToken(row.access_token_enc, tokenKey));
    return kc;
  }

  async sessionOk(): Promise<boolean> {
    try {
      await this.client();
      return true;
    } catch {
      return false;
    }
  }

  async holdings(): Promise<KiteHolding[]> {
    const kc = await this.client();
    const rows = await readRetry("holdings", () => kc.getHoldings());
    return rows.map((row) => ({ tradingsymbol: row.tradingsymbol, quantity: row.quantity }));
  }

  async equityCash(): Promise<number> {
    const kc = await this.client();
    const margins = await readRetry("margins", () => kc.getMargins("equity"));
    return margins.equity?.available.live_balance ?? margins.equity?.available.cash ?? 0;
  }

  async orders(): Promise<KiteOrder[]> {
    const kc = await this.client();
    const rows = await readRetry("orders", () => kc.getOrders());
    return rows.map((row) => ({
      order_id: row.order_id,
      status: row.status,
      filled_quantity: row.filled_quantity,
      average_price: row.average_price,
      tag: row.tag,
      status_message: row.status_message,
      tradingsymbol: row.tradingsymbol,
      transaction_type: row.transaction_type,
    }));
  }

  async gtts(): Promise<Array<{ id: number; status: string; tradingsymbol: string; orders: Awaited<ReturnType<Connect["getGTTs"]>>[number]["orders"] }>> {
    const kc = await this.client();
    const rows = await readRetry("gtts", () => kc.getGTTs());
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      tradingsymbol: row.condition?.tradingsymbol ?? "",
      orders: row.orders,
    }));
  }

  async deleteGtt(triggerId: string): Promise<void> {
    if (triggerId.startsWith("DRY-")) return;
    const kc = await this.client();
    await kc.deleteGTT(triggerId);
  }

  async placeOrder(params: {
    symbol: string;
    side: "BUY" | "SELL";
    qty: number;
    price: number;
    tag: string;
  }): Promise<Placed> {
    if (this.dryRun) return { orderId: `DRY-${params.tag}`, dryRun: true };
    const kc = await this.client();
    const result = await kc.placeOrder("regular", {
      exchange: "NSE",
      tradingsymbol: params.symbol,
      transaction_type: params.side,
      quantity: params.qty,
      product: "CNC",
      order_type: "LIMIT",
      price: params.price,
      validity: "DAY",
      tag: params.tag,
    });
    return { orderId: result.order_id, dryRun: false };
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (orderId.startsWith("DRY-")) return;
    const kc = await this.client();
    await kc.cancelOrder("regular", orderId);
  }

  async placeGtt(params: { symbol: string; qty: number; trigger: number; limit: number; lastPrice: number }): Promise<string> {
    if (this.dryRun) return `DRY-GTT-${params.symbol}-${Date.now()}`;
    const kc = await this.client();
    const body: GTTParams = {
      trigger_type: "single",
      exchange: "NSE",
      tradingsymbol: params.symbol,
      trigger_values: [params.trigger],
      last_price: params.lastPrice,
      orders: [
        {
          transaction_type: "SELL",
          quantity: params.qty,
          product: "CNC",
          order_type: "LIMIT",
          price: params.limit,
        },
      ],
    };
    const result = await kc.placeGTT(body);
    return String(result.trigger_id);
  }

  async modifyGtt(triggerId: string, params: { symbol: string; qty: number; trigger: number; limit: number; lastPrice: number }): Promise<void> {
    if (triggerId.startsWith("DRY-")) return;
    const kc = await this.client();
    await kc.modifyGTT(triggerId, {
      trigger_type: "single",
      exchange: "NSE",
      tradingsymbol: params.symbol,
      trigger_values: [params.trigger],
      last_price: params.lastPrice,
      orders: [
        {
          transaction_type: "SELL",
          quantity: params.qty,
          product: "CNC",
          order_type: "LIMIT",
          price: params.limit,
        },
      ],
    });
  }

  /** Kite virtual contract note. Personal-plan access is unconfirmed; callers fall back to the formula. */
  async contractCharges(params: { symbol: string; side: "BUY" | "SELL"; qty: number; price: number }): Promise<number | null> {
    try {
      const kc = await this.client();
      const rows = await kc.getvirtualContractNote([
        {
          order_id: `mlive-${params.symbol}`,
          exchange: "NSE",
          tradingsymbol: params.symbol,
          transaction_type: params.side,
          variety: "regular",
          product: "CNC",
          order_type: "LIMIT",
          quantity: params.qty,
          average_price: params.price,
        },
      ]);
      const total = rows[0]?.charges?.total;
      return typeof total === "number" ? total : null;
    } catch {
      return null;
    }
  }
}
