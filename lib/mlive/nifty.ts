import { marketSql } from "./market";
import type { NiftyReason } from "./nifty-reason";

export type NiftyPoint = { date: string; close: number };

function closeOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** NIFTY 50 daily closes, plus why the list is empty. Never invents a price. */
export async function loadNiftyCloses(from: string, to = "2100-01-01"): Promise<{ closes: NiftyPoint[]; reason: NiftyReason | null }> {
  const market = marketSql();
  if (!market) return { closes: [], reason: "no-url" };
  try {
    const rows = await market`
      SELECT ts::text AS ts, close::float8 AS close
        FROM candles_daily
       WHERE symbol = 'NIFTY 50'
         AND ts::date >= ${from}::date
         AND ts::date <= ${to}::date
       ORDER BY ts`;
    const closes: NiftyPoint[] = [];
    for (const row of rows) {
      const close = closeOf(row.close);
      if (close == null) continue;
      closes.push({ date: String(row.ts).slice(0, 10), close });
    }
    return { closes, reason: closes.length ? null : "no-data" };
  } catch (error) {
    console.error("Nifty market database unreachable:", error instanceof Error ? error.message : error);
    return { closes: [], reason: "unreachable" };
  }
}

export type SymbolClose = { symbol: string; date: string; close: number };

/** Daily closes for the named symbols. An empty reason means the market database could not be used. */
export async function loadSymbolCloses(symbols: readonly string[], from: string): Promise<{ rows: SymbolClose[]; reason: NiftyReason | null }> {
  const market = marketSql();
  if (!market) return { rows: [], reason: "no-url" };
  if (symbols.length === 0) return { rows: [], reason: null };
  try {
    const rows = await market.query(
      `SELECT symbol, ts::text AS ts, close::float8 AS close
         FROM candles_daily
        WHERE symbol = ANY($1::text[])
          AND ts::date >= $2::date
        ORDER BY symbol, ts`,
      [[...symbols], from]
    );
    const closes: SymbolClose[] = [];
    for (const row of rows) {
      const close = closeOf(row.close);
      if (close == null || !(close > 0)) continue;
      closes.push({ symbol: String(row.symbol).toUpperCase(), date: String(row.ts).slice(0, 10), close });
    }
    return { rows: closes, reason: null };
  } catch (error) {
    console.error("Long Game market database unreachable:", error instanceof Error ? error.message : error);
    return { rows: [], reason: "unreachable" };
  }
}
