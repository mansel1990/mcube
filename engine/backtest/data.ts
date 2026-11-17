import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { mq } from "../db";
import { monthFile } from "../jobs/market";
import type { Bar } from "../strategies/math";
import { barDay } from "./session";

export async function dailyBars(symbol: string): Promise<Bar[]> {
  const rows = await mq<{ ts: string; open: string; high: string; low: string; close: string; volume: string }>(
    `SELECT ts::text AS ts, open::text AS open, high::text AS high, low::text AS low, close::text AS close, volume::text AS volume
       FROM candles_daily WHERE symbol = $1 ORDER BY ts`,
    [symbol]
  );
  return rows.map(toBar);
}

export async function lastDailyDate(): Promise<string | null> {
  const rows = await mq<{ ts: string | null }>(`SELECT max(ts)::text AS ts FROM candles_daily`);
  const ts = rows[0]?.ts;
  return ts ? ts.slice(0, 10) : null;
}

export type UniverseRow = { symbol: string; tick: number };

export async function universe(series: "nifty500" | "nifty200" | "nifty100"): Promise<UniverseRow[]> {
  const rows = await mq<{ symbol: string; tick: string | null }>(
    `SELECT u.symbol, MIN(i.tick)::text AS tick
       FROM universe u
       LEFT JOIN instruments i ON i.symbol = u.symbol
      WHERE CASE $1
        WHEN 'nifty500' THEN u.nifty500
        WHEN 'nifty200' THEN u.nifty200
        ELSE u.nifty100
      END
      GROUP BY u.symbol
      ORDER BY u.symbol`,
    [series]
  );
  return rows.map((row) => ({ symbol: row.symbol, tick: Number(row.tick) > 0 ? Number(row.tick) : 0.05 }));
}

export async function forEachSession(
  symbol: string,
  kind: "5m" | "1m",
  from: string,
  to: string,
  visit: (day: string, bars: Bar[]) => void
): Promise<{ first: string | null; last: string | null; days: number }> {
  let first: string | null = null;
  let last: string | null = null;
  let days = 0;
  let currentDay = "";
  let current: Bar[] = [];
  const flush = () => {
    if (!currentDay || current.length === 0) {
      current = [];
      return;
    }
    if (currentDay >= from && currentDay <= to) {
      visit(currentDay, current);
      days += 1;
      if (!first || currentDay < first) first = currentDay;
      if (!last || currentDay > last) last = currentDay;
    }
    current = [];
  };
  for (const month of monthsBetween(from, to)) {
    const file = monthFile(kind, symbol, month);
    try {
      await access(file);
    } catch {
      continue;
    }
    const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        const bar = parseCandle(line);
        if (!bar) continue;
        const day = barDay(bar.t);
        if (currentDay && day !== currentDay) flush();
        if (day < from || day > to) {
          currentDay = day;
          continue;
        }
        currentDay = day;
        current.push(bar);
      }
    } catch (error) {
      console.error(`research skip ${symbol} ${month}: ${error instanceof Error ? error.message : error}`);
    } finally {
      lines.close();
    }
  }
  flush();
  return { first, last, days };
}

export type TradeRow = {
  runId: number;
  strategy: string;
  paramsKey: string;
  symbol: string;
  side: string;
  entryTs: string;
  exitTs: string;
  entryPx: number;
  exitPx: number;
  qty: number;
  gross: number;
  charges: number;
  net: number;
  netPct: number;
  r: number | null;
  exitReason: string;
  barsHeld: number;
};

export async function ensureTradeTable(): Promise<void> {
  await mq(`CREATE TABLE IF NOT EXISTS research_trades (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id bigint NOT NULL,
    strategy text NOT NULL,
    params_key text NOT NULL,
    symbol text NOT NULL,
    side text NOT NULL,
    entry_ts text NOT NULL,
    exit_ts text NOT NULL,
    entry_px numeric NOT NULL,
    exit_px numeric NOT NULL,
    qty integer NOT NULL,
    gross numeric NOT NULL,
    charges numeric NOT NULL,
    net numeric NOT NULL,
    net_pct numeric NOT NULL,
    r numeric,
    exit_reason text NOT NULL,
    bars_held integer NOT NULL
  )`);
  await mq(`CREATE INDEX IF NOT EXISTS research_trades_run_idx ON research_trades (run_id, strategy, params_key)`);
}

export async function deleteTrades(runId: number): Promise<void> {
  await mq(`DELETE FROM research_trades WHERE run_id = $1`, [runId]);
}

export async function pruneTrades(keep: number[]): Promise<void> {
  if (keep.length === 0) {
    await mq(`DELETE FROM research_trades`);
    return;
  }
  await mq(`DELETE FROM research_trades WHERE NOT (run_id = ANY($1::bigint[]))`, [keep]);
}

export async function insertTrades(rows: TradeRow[]): Promise<void> {
  const width = 17;
  for (let start = 0; start < rows.length; start += 80) {
    const slice = rows.slice(start, start + 80);
    const values: unknown[] = [];
    const groups = slice.map((row, index) => {
      const base = index * width;
      values.push(
        row.runId, row.strategy, row.paramsKey, row.symbol, row.side, row.entryTs, row.exitTs,
        row.entryPx, row.exitPx, row.qty, row.gross, row.charges, row.net, row.netPct, row.r, row.exitReason, row.barsHeld
      );
      return `(${Array.from({ length: width }, (_, column) => `$${base + column + 1}`).join(",")})`;
    });
    await mq(
      `INSERT INTO research_trades
        (run_id, strategy, params_key, symbol, side, entry_ts, exit_ts, entry_px, exit_px, qty, gross, charges, net, net_pct, r, exit_reason, bars_held)
       VALUES ${groups.join(",")}`,
      values
    );
  }
}

function toBar(row: { ts: string; open: string; high: string; low: string; close: string; volume: string }): Bar {
  return {
    t: row.ts.slice(0, 10),
    o: Number(row.open),
    h: Number(row.high),
    l: Number(row.low),
    c: Number(row.close),
    v: Number(row.volume),
  };
}

export function parseCandle(line: string): Bar | null {
  if (!line || line.startsWith("ts_ist")) return null;
  const [ts, open, high, low, close, volume] = line.split(",");
  if (!ts || !open) return null;
  const bar = { t: ts.trim(), o: Number(open), h: Number(high), l: Number(low), c: Number(close), v: Number(volume) };
  if (![bar.o, bar.h, bar.l, bar.c].every((value) => Number.isFinite(value))) return null;
  return bar;
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  if (!year || !month || !endYear || !endMonth) return out;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

export type StoredTradeRef = {
  runId: number;
  strategy: string;
  paramsKey: string;
  symbol: string;
  entryTs: string;
  exitTs: string;
  net: number;
};

export async function tradesInRuns(runIds: number[], symbols: string[]): Promise<StoredTradeRef[]> {
  if (runIds.length === 0 || symbols.length === 0) return [];
  const rows = await mq<{
    run_id: string;
    strategy: string;
    params_key: string;
    symbol: string;
    entry_ts: string;
    exit_ts: string;
    net: string;
  }>(
    `SELECT run_id::text AS run_id, strategy, params_key, symbol, entry_ts, exit_ts, net::text AS net
       FROM research_trades
      WHERE run_id = ANY($1::bigint[]) AND symbol = ANY($2::text[])`,
    [runIds, symbols]
  );
  return rows.map((row) => ({
    runId: Number(row.run_id),
    strategy: row.strategy,
    paramsKey: row.params_key,
    symbol: row.symbol,
    entryTs: row.entry_ts,
    exitTs: row.exit_ts,
    net: Number(row.net),
  }));
}

export function intersectMask(
  trades: readonly StoredTradeRef[],
  mask: readonly { symbol: string; from: string; to: string; reason: string }[]
): Array<StoredTradeRef & { maskFrom: string; maskTo: string; reason: string }> {
  const bySymbol = new Map<string, { from: string; to: string; reason: string }[]>();
  for (const row of mask) {
    const list = bySymbol.get(row.symbol) ?? [];
    list.push(row);
    bySymbol.set(row.symbol, list);
  }
  const hits: Array<StoredTradeRef & { maskFrom: string; maskTo: string; reason: string }> = [];
  for (const trade of trades) {
    const entry = trade.entryTs.slice(0, 10);
    const ranges = bySymbol.get(trade.symbol);
    if (!ranges) continue;
    const match = ranges.find((range) => entry >= range.from && entry <= range.to);
    if (!match) continue;
    hits.push({ ...trade, maskFrom: match.from, maskTo: match.to, reason: match.reason });
  }
  return hits;
}
