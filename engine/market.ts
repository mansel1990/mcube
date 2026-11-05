import YahooFinance from "yahoo-finance2";
import type { Bar } from "@/lib/mlive/rules";
import { num, q } from "./db";

const yahoo = new YahooFinance();

export async function loadBars(symbol: string, limit = 260): Promise<Bar[]> {
  const rows = await q<{ date: unknown; high: unknown; low: unknown; close: unknown; volume: unknown }>(
    `SELECT date::text AS date, high, low, close, volume
       FROM stocks.daily_ohlcv
      WHERE ticker = $1
      ORDER BY date DESC
      LIMIT $2`,
    [symbol, limit]
  );
  return rows
    .reverse()
    .map((row) => ({
      date: String(row.date).slice(0, 10),
      high: num(row.high),
      low: num(row.low),
      close: num(row.close),
      volume: num(row.volume),
    }));
}

export async function previousClose(symbol: string): Promise<{ close: number; volume: number } | null> {
  const rows = await q<{ close: unknown; volume: unknown }>(
    `SELECT close, volume FROM stocks.daily_ohlcv WHERE ticker = $1 ORDER BY date DESC LIMIT 1`,
    [symbol]
  );
  if (!rows[0]) return null;
  return { close: num(rows[0].close), volume: num(rows[0].volume) };
}

export async function bhavcopyPresent(tradeDate: string): Promise<boolean> {
  const rows = await q<{ n: unknown }>(
    `SELECT COUNT(*)::int AS n FROM stocks.daily_ohlcv WHERE date = $1::date`,
    [tradeDate]
  );
  return num(rows[0]?.n) > 100;
}

export async function livePrice(symbol: string): Promise<number | null> {
  try {
    const quote = await yahoo.quote(`${symbol}.NS`, { fields: ["regularMarketPrice"] });
    const price = quote.regularMarketPrice;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function yahooPreviousClose(symbol: string): Promise<number | null> {
  try {
    const quote = await yahoo.quote(`${symbol}.NS`, { fields: ["regularMarketPreviousClose"] });
    const price = quote.regularMarketPreviousClose;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}
