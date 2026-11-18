import { audit } from "../audit";
import { q } from "../db";
import { openingContribution, registrationError, remainingUnassigned, type Pocket } from "./pockets";

export type { Pocket };

export async function attributedUnits(symbol: string): Promise<number> {
  const rows = await q<{ units: unknown }>(
    `SELECT COALESCE(SUM(units), 0) AS units FROM mlive.mlive_longgame_holdings WHERE symbol = $1`,
    [symbol]
  );
  return Number(rows[0]?.units ?? 0);
}

export async function registerOpeningHolding(input: {
  pocket: Pocket;
  symbol: string;
  units: number;
  averagePrice: number;
  acquiredOn: string;
  kiteUnits: number;
}): Promise<{ ok: true; moneyAdded: number } | { ok: false; error: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  const attributed = await attributedUnits(symbol);
  const remaining = remainingUnassigned(input.kiteUnits, attributed);
  const error = registrationError(input.units, remaining);
  if (error) return { ok: false, error };
  if (!(input.averagePrice > 0)) return { ok: false, error: "Average price must be above zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.acquiredOn)) return { ok: false, error: "Purchase date must be YYYY-MM-DD." };
  const contribution = openingContribution(input.units, input.averagePrice);
  const key = `opening:${input.pocket}:${symbol}:${input.acquiredOn}:${input.units}:${input.averagePrice}`;
  const existing = await q<{ id: string }>(
    `SELECT id::text AS id FROM mlive.mlive_longgame_ledger WHERE idempotency_key = $1`,
    [key]
  );
  if (existing.length > 0) return { ok: true, moneyAdded: contribution.moneyAdded };
  await q(
    `INSERT INTO mlive.mlive_longgame_ledger
       (pocket, kind, amount, units, symbol, price, idempotency_key, note)
     VALUES ($1, 'opening_holding', $2, $3, $4, $5, $6, $7)`,
    [input.pocket, contribution.moneyAdded, input.units, symbol, input.averagePrice, key, "Existing holding registered. No cash deposit."]
  );
  await q(
    `INSERT INTO mlive.mlive_longgame_holdings (pocket, symbol, units, avg_price)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (pocket, symbol) DO UPDATE
       SET units = mlive.mlive_longgame_holdings.units + EXCLUDED.units,
           avg_price = CASE
             WHEN mlive.mlive_longgame_holdings.units + EXCLUDED.units = 0 THEN EXCLUDED.avg_price
             ELSE (mlive.mlive_longgame_holdings.units * mlive.mlive_longgame_holdings.avg_price + EXCLUDED.units * EXCLUDED.avg_price)
                  / (mlive.mlive_longgame_holdings.units + EXCLUDED.units)
           END,
           updated_at = now()`,
    [input.pocket, symbol, input.units, input.averagePrice]
  );
  await q(
    `INSERT INTO mlive.mlive_longgame_lots (pocket, symbol, qty_open, qty_original, price, acquired_on)
     VALUES ($1, $2, $3, $3, $4, $5::date)`,
    [input.pocket, symbol, input.units, input.averagePrice, input.acquiredOn]
  );
  await audit({
    actor: "user",
    action: "longgame.opening",
    symbol,
    reason: `${input.pocket} opening holding ${input.units} at ${input.averagePrice} on ${input.acquiredOn}. Money added ${contribution.moneyAdded}. Cash unchanged.`,
    after: { pocket: input.pocket, units: input.units, averagePrice: input.averagePrice, acquiredOn: input.acquiredOn, moneyAdded: contribution.moneyAdded, cash: 0 },
  });
  return { ok: true, moneyAdded: contribution.moneyAdded };
}
