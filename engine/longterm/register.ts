import { audit } from "../audit";
import { db, q } from "../db";
import { acquisitionRecord, type TaxAssumption } from "@/lib/mlive/acquisition";
import type { OpenLot } from "@/lib/mlive/tradebook";
import { lotMoney, lotUnits } from "@/lib/mlive/tradebook";
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

export type CoreRegistration =
  | { ok: true; moneyAdded: number; average: number }
  | { ok: false; error: string };

/** Core only. A tradebook writes one lot per remaining buy. A month is an estimate. A blank month does not invent a purchase date. */
export async function registerCoreOpening(input: {
  symbol: string;
  units: number;
  kiteUnits: number;
  kiteAverage: number;
  registeredOn: string;
  month?: string | null;
  lots?: readonly OpenLot[];
  checksum?: string | null;
}): Promise<CoreRegistration> {
  const symbol = input.symbol.trim().toUpperCase();
  const attributed = await attributedUnits(symbol);
  const remaining = remainingUnassigned(input.kiteUnits, attributed);
  const lots = input.lots ?? [];
  const fromBook = lots.length > 0;
  const units = fromBook ? lotUnits(lots) : input.units;
  const error = registrationError(Math.round(units), remaining);
  if (error) return { ok: false, error };
  if (fromBook && Math.abs(units - remaining) > 0.0001) {
    return { ok: false, error: "Reconstructed units do not match the unattributed Kite units." };
  }
  const moneyAdded = fromBook ? lotMoney(lots) : openingContribution(units, input.kiteAverage).moneyAdded;
  const average = units > 0 ? moneyAdded / units : 0;
  if (!(average > 0)) return { ok: false, error: "Average price must be above zero." };
  const assumption: { acquiredOn: string; acquisitionDate: string | null; taxDateAssumption: TaxAssumption; estimated: boolean; registeredOn: string } = fromBook
    ? { acquiredOn: lots[0].date, acquisitionDate: lots[0].date, taxDateAssumption: "tradebook", estimated: false, registeredOn: input.registeredOn }
    : acquisitionRecord(input.month, input.registeredOn);
  const key = fromBook
    ? `opening:core:${symbol}:${input.checksum ?? lots.map((lot) => `${lot.date}:${lot.units}:${lot.price}`).join("|")}`
    : `opening:core:${symbol}:${assumption.acquiredOn}:${units}:${average}`;
  const existing = await q<{ id: string }>(
    `SELECT id::text AS id FROM mlive.mlive_longgame_ledger WHERE idempotency_key = $1`,
    [key]
  );
  if (existing.length > 0) return { ok: true, moneyAdded, average };
  const lotRows = fromBook
    ? lots
    : [{ date: assumption.acquiredOn, units, price: input.kiteAverage }];
  const sql = db();
  await sql.transaction([
    sql`INSERT INTO mlive.mlive_longgame_ledger
          (pocket, kind, amount, units, symbol, price, idempotency_key, note)
        VALUES ('core', 'opening_holding', ${moneyAdded}, ${units}, ${symbol}, ${average}, ${key}, ${"Existing holding registered to Core. No cash deposit."})`,
    sql`INSERT INTO mlive.mlive_longgame_holdings (pocket, symbol, units, avg_price)
        VALUES ('core', ${symbol}, ${units}, ${average})
        ON CONFLICT (pocket, symbol) DO UPDATE
          SET units = mlive.mlive_longgame_holdings.units + EXCLUDED.units,
              avg_price = CASE
                WHEN mlive.mlive_longgame_holdings.units + EXCLUDED.units = 0 THEN EXCLUDED.avg_price
                ELSE (mlive.mlive_longgame_holdings.units * mlive.mlive_longgame_holdings.avg_price + EXCLUDED.units * EXCLUDED.avg_price)
                     / (mlive.mlive_longgame_holdings.units + EXCLUDED.units)
              END,
              updated_at = now()`,
    ...lotRows.map((lot) => sql`INSERT INTO mlive.mlive_longgame_lots
          (pocket, symbol, qty_open, qty_original, price, acquired_on, acquisition_date, tax_date_assumption, registered_on, estimated)
        VALUES (
          'core', ${symbol}, ${lot.units}, ${lot.units}, ${lot.price}, ${lot.date}::date,
          ${fromBook ? lot.date : assumption.acquisitionDate},
          ${fromBook ? "tradebook" : assumption.taxDateAssumption},
          ${input.registeredOn}::date,
          ${fromBook ? false : assumption.estimated}
        )`),
  ]);
  await audit({
    actor: "user",
    action: "longgame.opening",
    symbol,
    reason: `core opening holding ${units} at ${average}. Money added ${moneyAdded}. Cash unchanged.`,
    after: {
      pocket: "core",
      units,
      average,
      moneyAdded,
      cash: 0,
      taxDateAssumption: fromBook ? "tradebook" : assumption.taxDateAssumption,
      acquisitionDate: fromBook ? null : assumption.acquisitionDate,
      checksum: input.checksum ?? null,
      lots: lotRows.map((lot) => ({ date: lot.date, units: lot.units, price: lot.price })),
    },
  });
  return { ok: true, moneyAdded, average };
}
