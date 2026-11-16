import { todayIst } from "@/lib/mlive/calendar";
import { mq, q } from "../db";
import { MliveKite } from "../kite";
import { loadSettings, loadState } from "../load";
import { runJob } from "../run";
import type { Bar } from "../strategies/math";
import { orb } from "../strategies/orb";
import { vwapTrend } from "../strategies/vwap";

function istClock(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

export async function intraday(): Promise<void> {
  await runJob("intraday", async (runId) => {
    const settings = await loadSettings();
    const state = await loadState();
    const kite = new MliveKite(settings.dryRun);
    const day = todayIst();
    const passed = await q<{ strategy: string }>(
      `SELECT strategy FROM mlive.mlive_research WHERE book = 'intraday' AND passed = true GROUP BY strategy HAVING count(DISTINCT sample) = 2`
    );
    const open = await q<{ id: string; symbol: string; qty: number; side: string }>(
      `SELECT id::text AS id, symbol, qty, side FROM mlive.mlive_positions WHERE book = 'intraday' AND closed_at IS NULL AND dry_run = $1`,
      [settings.dryRun]
    );
    const clock = istClock();
    let flattened = 0;
    if (clock >= settings.intradayExitTime) {
      for (const row of open) {
        const quote = await q<{ price: string }>(`SELECT price::text AS price FROM mlive.mlive_quotes WHERE symbol = $1`, [row.symbol]);
        const price = Number(quote[0]?.price ?? 0);
        if (!(price > 0)) continue;
        const side = row.side === "short" ? "BUY" : "SELL";
        const placed = await kite.placeOrder({ symbol: row.symbol, side, qty: row.qty, price, tag: `day-flat-${row.id}`, product: "MIS" });
        await q(
          `INSERT INTO mlive.mlive_orders (symbol, side, qty, limit_price, tag, kite_order_id, status, book, dry_run, placed_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', 'intraday', $7, now())`,
          [row.symbol, side, row.qty, price, `day-flat-${row.id}`, placed.orderId, settings.dryRun]
        );
        flattened += 1;
      }
    }
    const pnlRows = await q<{ pnl: string }>(
      `SELECT COALESCE(SUM(realised_pnl), 0)::text AS pnl FROM mlive.mlive_positions
        WHERE book = 'intraday' AND closed_at::date = $1::date AND dry_run = $2`,
      [day, settings.dryRun]
    );
    const pnl = Number(pnlRows[0]?.pnl ?? 0);
    const stopped = pnl <= -settings.intradayCapital * settings.intradayDayLossPct;
    if (stopped) {
      await q(
        `INSERT INTO mlive.mlive_settings (key, value) VALUES ('intraday_halted_on', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [JSON.stringify(day)]
      );
    }
    const red = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM (
         SELECT closed_at::date AS d, SUM(realised_pnl) AS pnl
           FROM mlive.mlive_positions
          WHERE book = 'intraday' AND closed_at IS NOT NULL AND dry_run = $1
          GROUP BY closed_at::date
          ORDER BY closed_at::date DESC
          LIMIT 10
       ) days WHERE pnl < 0`,
      [settings.dryRun]
    );
    if (Number(red[0]?.n ?? 0) >= 10) {
      await q(`INSERT INTO mlive.mlive_settings (key, value) VALUES ('intraday_frozen', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()`);
    }
    const sent = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM mlive.mlive_orders WHERE book = 'intraday' AND side = 'BUY' AND placed_at::date = $1::date`,
      [day]
    );
    const halted = await q<{ value: unknown }>(`SELECT value FROM mlive.mlive_settings WHERE key = 'intraday_halted_on'`);
    const frozen = await q<{ value: unknown }>(`SELECT value FROM mlive.mlive_settings WHERE key = 'intraday_frozen'`);
    const quoteAge = await q<{ as_of: string | null }>(`SELECT max(as_of)::text AS as_of FROM mlive.mlive_quotes`);
    const ageMs = quoteAge[0]?.as_of ? Date.now() - new Date(quoteAge[0].as_of).getTime() : Number.POSITIVE_INFINITY;
    const feedUp = ageMs <= 2 * 60 * 1000;
    const names = passed.map((row) => row.strategy);
    const haltDay = String(halted[0]?.value ?? "").replace(/"/g, "");
    const canEnter = state.status === "active" && names.length > 0 && !stopped && frozen[0]?.value !== true && haltDay !== day && clock < settings.intradayExitTime && Number(sent[0]?.n ?? 0) < settings.intradayMaxTrades && feedUp;
    const entered = canEnter ? await openEntries(kite, settings, names, day, settings.intradayMaxTrades - Number(sent[0]?.n ?? 0), new Set(open.map((row) => row.symbol))) : 0;
    const lived = await q<{ n: string }>(
      `SELECT count(DISTINCT closed_at::date)::text AS n FROM mlive.mlive_positions WHERE book = 'intraday' AND closed_at IS NOT NULL AND dry_run = false`
    );
    if (Number(lived[0]?.n ?? 0) >= 10) {
      await q(`INSERT INTO mlive.mlive_settings (key, value) VALUES ('intraday_scale_ok', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()`);
    }
    return { runId, flattened, entered, passed: names, canEnter, stopped, short: settings.intradayShort, feedUp };
  });
}

async function openEntries(
  kite: MliveKite,
  settings: Awaited<ReturnType<typeof loadSettings>>,
  names: string[],
  day: string,
  room: number,
  held: Set<string>
): Promise<number> {
  let placed = 0;
  const wanted: Array<{ symbol: string; side: "long" | "short"; entry: number; stop: number }> = [];
  try {
    if (names.includes("orb")) wanted.push(...(await signals(day, "candles_5m", (bars) => orb(bars, 3))));
    if (names.includes("vwap")) wanted.push(...(await signals(day, "candles_1m", (bars) => vwapTrend(bars).map((trade) => ({ ...trade, stop: trade.entryPx * (trade.side === "long" ? 0.995 : 1.005) })))));
  } catch {
    return 0;
  }
  for (const idea of wanted) {
    if (placed >= room) break;
    if (held.has(idea.symbol)) continue;
    if (idea.side === "short" && !settings.intradayShort) continue;
    const risk = Math.abs(idea.entry - idea.stop);
    if (!(risk > 0)) continue;
    const qty = Math.floor((settings.intradayCapital * settings.intradayRiskPct) / risk);
    if (qty < 1 || qty * idea.entry > settings.intradayCapital * settings.intradayLeverage) continue;
    const side = idea.side === "short" ? "SELL" : "BUY";
    try {
      const order = await kite.placeOrder({ symbol: idea.symbol, side, qty, price: idea.entry, tag: `day-${day}-${idea.symbol}-${placed}`, product: "MIS" });
      await q(
        `INSERT INTO mlive.mlive_positions (symbol, strategy, qty, avg_price, book, side, dry_run)
         VALUES ($1, $2, $3, $4, 'intraday', $5, $6)`,
        [idea.symbol, names.includes("vwap") ? "vwap" : "orb", qty, idea.entry, idea.side, settings.dryRun]
      );
      await q(
        `INSERT INTO mlive.mlive_orders (symbol, side, qty, limit_price, tag, kite_order_id, status, book, dry_run, placed_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', 'intraday', $7, now())`,
        [idea.symbol, side, qty, idea.entry, `day-${day}-${idea.symbol}-${placed}`, order.orderId, settings.dryRun]
      );
      held.add(idea.symbol);
      placed += 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
  return placed;
}

async function signals(
  day: string,
  table: "candles_5m" | "candles_1m",
  run: (bars: Bar[]) => Array<{ entry: string; side: "long" | "short"; entryPx: number; stop?: number }>
): Promise<Array<{ symbol: string; side: "long" | "short"; entry: number; stop: number }>> {
  const rows = await mq<{ symbol: string; ts: string; open: string; high: string; low: string; close: string; volume: string }>(
    `SELECT symbol, (ts AT TIME ZONE 'Asia/Kolkata')::text AS ts, open, high, low, close, volume FROM ${table} WHERE (ts AT TIME ZONE 'Asia/Kolkata')::date = $1::date ORDER BY symbol, ts`,
    [day]
  );
  const grouped = new Map<string, Bar[]>();
  for (const row of rows) {
    const list = grouped.get(row.symbol) ?? [];
    list.push({ t: row.ts.slice(0, 16), o: Number(row.open), h: Number(row.high), l: Number(row.low), c: Number(row.close), v: Number(row.volume) });
    grouped.set(row.symbol, list);
  }
  const out: Array<{ symbol: string; side: "long" | "short"; entry: number; stop: number }> = [];
  for (const [symbol, bars] of grouped) {
    for (const trade of run(bars)) {
      if (!trade.entry.startsWith(day)) continue;
      const stop = trade.stop ?? trade.entryPx * (trade.side === "long" ? 0.995 : 1.005);
      out.push({ symbol, side: trade.side, entry: trade.entryPx, stop });
    }
  }
  return out.slice(0, 4);
}
