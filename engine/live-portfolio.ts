import { estimateCharges, type ChargeRates } from "@/lib/mlive/charges";
import { sizeCapOrder, type SizingResult } from "@/lib/mlive/rules";
import { num, q } from "./db";
import { livePrice, previousClose } from "./market";

export type MarkedSwingBook = {
  equity: number;
  gross: number;
  positions: number;
};

export async function markedSwingBook(fund: number, includeDry: boolean): Promise<MarkedSwingBook> {
  const rows = await q<{ symbol: string; qty: unknown; avg_price: unknown }>(
    `SELECT symbol, qty, avg_price
       FROM mlive.mlive_positions
      WHERE book = 'swing' AND closed_at IS NULL AND ($1::boolean OR dry_run = false)
      ORDER BY id`,
    [includeDry]
  );
  let cost = 0;
  let gross = 0;
  for (const row of rows) {
    const qty = num(row.qty);
    const avg = num(row.avg_price);
    const live = await livePrice(row.symbol);
    const prior = live == null ? await previousClose(row.symbol) : null;
    const mark = live ?? prior?.close ?? avg;
    cost += qty * avg;
    gross += qty * mark;
  }
  return {
    equity: fund - cost + gross,
    gross,
    positions: rows.length,
  };
}

export async function pendingGrossCommitment(day: string, includeDry: boolean, excludeDecisionId?: number): Promise<number> {
  const rows = await q<{ total: unknown }>(
    `SELECT
       COALESCE((
         SELECT SUM((o.qty - o.filled_qty) * o.limit_price)
           FROM mlive.mlive_orders o
           JOIN mlive.mlive_decisions d ON d.id = o.decision_id
          WHERE o.side = 'BUY'
            AND d.trade_date = $1::date
            AND o.status NOT IN ('CANCELLED', 'REJECTED', 'COMPLETE')
            AND ($2::boolean OR o.dry_run = false)
       ), 0)
       +
       COALESCE((
         SELECT SUM((d.sizing->>'qty')::numeric * (d.sizing->>'limit')::numeric)
           FROM mlive.mlive_decisions d
          WHERE d.trade_date = $1::date
            AND d.side = 'BUY'
            AND d.outcome IN ('proposed', 'approved')
            AND ($2::boolean OR d.dry_run = false)
            AND ($3::bigint IS NULL OR d.id <> $3)
            AND NOT EXISTS (
              SELECT 1 FROM mlive.mlive_orders o
               WHERE o.decision_id = d.id
                 AND o.status NOT IN ('CANCELLED', 'REJECTED')
            )
       ), 0) AS total`,
    [day, includeDry, excludeDecisionId ?? null]
  );
  return num(rows[0]?.total);
}

export function sizeMomentumOrder(input: {
  equity: number;
  entry: number;
  spendable: number;
  maxOrderPct: number;
  minOrderInr: number;
  rates?: ChargeRates;
}): SizingResult {
  const sized = sizeCapOrder({
    fund: input.equity,
    entry: input.entry,
    spendable: input.spendable,
    maxOrderPct: input.maxOrderPct,
    minOrderInr: input.minOrderInr,
  });
  let qty = sized.qty;
  while (qty > 0) {
    const notional = qty * input.entry;
    const charges = estimateCharges("BUY", notional, input.rates).total;
    if (notional + charges <= input.spendable + 1e-6 && notional + 1e-6 >= input.minOrderInr) break;
    qty -= 1;
  }
  if (qty === sized.qty) return sized;
  if (qty < 1 || qty * input.entry + 1e-6 < input.minOrderInr) {
    return { ...sized, qty: 0, notional: 0, reason: "no_funds", text: `${sized.text} · charges → no_funds` };
  }
  return { ...sized, qty, notional: qty * input.entry, text: `${sized.text} · charges → ${qty}` };
}

export function grossAllows(currentGross: number, committed: number, nextNotional: number, equity: number, maxGrossPct: number): boolean {
  if (!(equity > 0)) return false;
  return currentGross + committed + nextNotional <= maxGrossPct * equity + 1e-6;
}
