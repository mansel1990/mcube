import { kiteMarksToStore, longGameEtfSymbols } from "@/lib/mlive/long-game-symbols";
import { q } from "../db";
import { allocateIncomeUnits, reductionAttribution, type Pocket } from "./pockets";

const LIQUID = "LIQUIDBEES";

type HoldingRow = { pocket: Pocket; symbol: string; units: number };

export async function syncLongGameHoldings(kite: readonly { tradingsymbol: string; quantity: number; lastPrice?: number }[]): Promise<void> {
  const rows = await q<{ pocket: string; symbol: string; units: unknown }>(
    `SELECT pocket, symbol, units FROM mlive.mlive_longgame_holdings WHERE units <> 0`
  );
  if (rows.length > 0) {
  const grouped = new Map<string, HoldingRow[]>();
  for (const row of rows) {
    const symbol = String(row.symbol).toUpperCase();
    const pocket: Pocket = row.pocket === "radar" ? "radar" : "core";
    const list = grouped.get(symbol) ?? [];
    list.push({ pocket, symbol, units: Number(row.units) });
    grouped.set(symbol, list);
  }
  const kiteBySymbol = new Map(kite.map((row) => [row.tradingsymbol.toUpperCase(), row.quantity]));
  for (const [symbol, owners] of grouped) {
    const attributed = owners.reduce((sum, row) => sum + row.units, 0);
    const live = kiteBySymbol.get(symbol) ?? 0;
    const delta = live - attributed;
    if (delta === 0) continue;
    const key = `kite:${symbol}:${live}:${attributed}`;
    const prior = await q(`SELECT id FROM mlive.mlive_longgame_reconcile WHERE idempotency_key = $1`, [key]);
    if (prior.length > 0) continue;
    if (delta > 0 && symbol === LIQUID && Number.isInteger(delta)) {
      const core = owners.find((row) => row.pocket === "core")?.units ?? 0;
      const radar = owners.find((row) => row.pocket === "radar")?.units ?? 0;
      const split = allocateIncomeUnits(core, radar, delta);
      await q(
        `INSERT INTO mlive.mlive_longgame_reconcile
           (symbol, kind, status, units, price_source, allocation, idempotency_key, note)
         VALUES ($1, 'increase', 'applied', $2, 'close', $3::jsonb, $4, $5)`,
        [symbol, delta, JSON.stringify({ core: split.core, radar: split.radar }), key, split.note]
      );
      continue;
    }
    if (delta > 0) {
      await q(
        `INSERT INTO mlive.mlive_longgame_reconcile
           (symbol, kind, status, units, idempotency_key, note)
         VALUES ($1, 'increase', 'untracked', $2, $3, 'Unexplained increase. Register the units if they belong to Long Game.')`,
        [symbol, delta, key]
      );
      continue;
    }
    const attribution = reductionAttribution(owners);
    await q(
      `INSERT INTO mlive.mlive_longgame_reconcile
         (symbol, kind, status, units, allocation, idempotency_key, note)
       VALUES ($1, 'reduction', 'needs_you', $2, $3::jsonb, $4, $5)`,
      [
        symbol,
        Math.abs(delta),
        JSON.stringify(attribution),
        key,
        attribution.needsSplit
          ? "Kite units fell. Both pockets own this ETF, so the owner must split the missing units."
          : "Kite units fell. Confirm the pocket that sold.",
      ]
    );
    }
  }
  await storeHoldingMarks(kite, rows.map((row) => String(row.symbol)));
}

/** Saves the Kite holding mark. A missing table does not change the quantity reconciliation above. */
async function storeHoldingMarks(
  kite: readonly { tradingsymbol: string; lastPrice?: number }[],
  attributed: readonly string[]
): Promise<void> {
  try {
    const settings = await q<{ value: unknown }>(`SELECT value FROM mlive.mlive_settings WHERE key = 'longterm_secondary'`);
    const secondary = String(settings[0]?.value ?? "mid").replace(/"/g, "");
    const marks = kiteMarksToStore(kite, longGameEtfSymbols(secondary, attributed));
    for (const mark of marks) {
      await q(
        `INSERT INTO mlive.mlive_longgame_marks (symbol, price, observed_at, source)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (symbol) DO UPDATE
           SET price = EXCLUDED.price, observed_at = now(), source = EXCLUDED.source`,
        [mark.symbol, mark.price, mark.source]
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("mlive_longgame_marks")) throw error;
  }
}
