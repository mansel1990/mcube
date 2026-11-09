import { sql } from "@/lib/sql";
import { todayIst } from "./calendar";
import { liveMarks, settingsMap } from "./read";
import {
  buildPnl,
  EXIT_REASONS,
  type ExitReason,
  type PnlBar,
  type PnlChargeItem,
  type PnlFill,
  type PnlGtt,
  type PnlLedgerRow,
  type PnlModel,
  type PnlPosition,
  type PnlRange,
  type PnlStrategyFilter,
} from "./pnl";

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stamp(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value ?? "");
}

function day(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  const text = String(value ?? "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : text.slice(0, 10);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asReason(value: unknown): ExitReason | null {
  const text = String(value ?? "");
  return EXIT_REASONS.includes(text as ExitReason) ? (text as ExitReason) : null;
}

/** Until migration 006 is applied the table is absent and booked position charges are used. */
async function chargeItemRows(includeDry: boolean) {
  try {
    return await sql`SELECT id, position_id, order_id, side, intraday, source, brokerage, stt, exchange, sebi, stamp, gst, dp, total, ts, dry_run
          FROM mlive.mlive_charge_items
         WHERE (${includeDry}::boolean OR dry_run = false)`;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = error instanceof Error ? error.message : "";
    if (code === "42P01" || message.includes("mlive_charge_items")) return [];
    throw error;
  }
}

type FillRow = PnlFill & { symbol: string; dryRun: boolean; at: number };
type PositionRow = PnlPosition & { at: number; closedMs: number | null };

export async function pnlPayload(range: PnlRange, strategy: PnlStrategyFilter): Promise<PnlModel> {
  const settings = await settingsMap();
  const includeDry = settings.dry_run !== false;
  const today = todayIst();
  const [positionRows, fillRows, itemRows, ledgerRows, equityRows, gttRows, decisionRows, auditRows] = await Promise.all([
    sql`SELECT id, symbol, strategy, qty, avg_price, opened_at, closed_at, trend_stop, realised_pnl, charges, dry_run
          FROM mlive.mlive_positions
         WHERE (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT f.id, f.order_id, f.qty, f.price, f.ts, o.symbol, o.side, o.kind, o.dry_run
          FROM mlive.mlive_fills f
          JOIN mlive.mlive_orders o ON o.id = f.order_id
         WHERE (${includeDry}::boolean OR o.dry_run = false)`,
    chargeItemRows(includeDry),
    sql`SELECT id, kind, amount, ts, ref_order_id, dry_run, note
          FROM mlive.mlive_fund_ledger
         WHERE (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT trade_date::text AS trade_date, system_value FROM mlive.mlive_equity_daily ORDER BY trade_date`,
    sql`SELECT position_id, trigger_price, status, history, dry_run
          FROM mlive.mlive_gtts
         WHERE (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT id, position_id, symbol, side, reason_code, reason_text, sizing, trade_date::text AS trade_date, dry_run
          FROM mlive.mlive_decisions
         WHERE (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT id, symbol, ts FROM mlive.mlive_audit_log WHERE symbol IS NOT NULL ORDER BY id`,
  ]);

  const positions: PositionRow[] = positionRows.map((row) => ({
    id: num(row.id),
    symbol: String(row.symbol),
    strategy: row.strategy === "ema" ? "ema" : row.strategy === "rs" ? "rs" : null,
    qty: num(row.qty),
    avgPrice: num(row.avg_price),
    openedAt: stamp(row.opened_at),
    closedAt: row.closed_at == null ? null : stamp(row.closed_at),
    trendStop: row.trend_stop == null ? null : num(row.trend_stop),
    realisedPnl: num(row.realised_pnl),
    charges: num(row.charges),
    dryRun: row.dry_run === true,
    at: Date.parse(stamp(row.opened_at)),
    closedMs: row.closed_at == null ? null : Date.parse(stamp(row.closed_at)),
  }));

  const fills: FillRow[] = fillRows.map((row) => ({
    id: num(row.id),
    positionId: 0,
    orderId: row.order_id == null ? null : num(row.order_id),
    side: String(row.side) === "SELL" || String(row.kind) === "gtt_exit" ? "SELL" : "BUY",
    qty: num(row.qty),
    price: num(row.price),
    ts: stamp(row.ts),
    kind: row.kind == null ? null : String(row.kind),
    symbol: String(row.symbol),
    dryRun: row.dry_run === true,
    at: Date.parse(stamp(row.ts)),
  }));

  const byOpened = [...positions].sort((a, b) => b.at - a.at);
  for (const fill of fills) {
    const owner = byOpened.find((position) =>
      position.symbol === fill.symbol &&
      position.dryRun === fill.dryRun &&
      fill.at >= position.at - 60_000 &&
      fill.at <= (position.closedMs ?? Date.now()) + 60_000
    );
    fill.positionId = owner?.id ?? -1;
  }

  for (const position of positions) {
    const entry = day(position.openedAt);
    const exit = position.closedAt ? day(position.closedAt) : null;
    const buy = decisionRows.find((row) => String(row.side) === "BUY" && String(row.symbol) === position.symbol && day(row.trade_date) === entry);
    const sell = decisionRows.find((row) => String(row.side) === "SELL" && (num(row.position_id) === position.id || (String(row.symbol) === position.symbol && exit != null && day(row.trade_date) === exit)));
    const sizing = buy?.sizing && typeof buy.sizing === "object" ? (buy.sizing as { stop?: number; text?: string }) : null;
    const history = gttRows
      .filter((row) => num(row.position_id) === position.id)
      .flatMap((row) => asArray(row.history)) as { stop?: number }[];
    const firstStop = history.find((row) => typeof row.stop === "number")?.stop ?? (typeof sizing?.stop === "number" ? sizing.stop : null);
    const sellFill = [...fills].reverse().find((fill) => fill.positionId === position.id && fill.side === "SELL");
    position.initialStop = firstStop;
    position.exitReason = position.closedAt
      ? asReason(sellFill?.kind) ?? asReason(sell?.reason_code) ?? "trend_stop"
      : null;
    position.decision = (sell?.reason_text ?? buy?.reason_text ?? null) as string | null;
    position.sizing = sizing?.text ?? null;
    const openedMs = position.at;
    const closedMs = position.closedMs ?? Date.now();
    position.auditIds = auditRows
      .filter((row) => String(row.symbol).toUpperCase() === position.symbol.toUpperCase())
      .filter((row) => {
        const at = Date.parse(stamp(row.ts));
        return at >= openedMs - 60_000 && at <= closedMs + 86_400_000;
      })
      .slice(-20)
      .map((row) => num(row.id));
  }

  const symbols = [...new Set(positions.map((position) => position.symbol))];
  const minDate = positions.reduce((min, position) => (day(position.openedAt) < min ? day(position.openedAt) : min), today);
  const [marks, bars] = await Promise.all([
    liveMarks(positions.filter((position) => position.closedAt == null && position.qty > 0).map((position) => position.symbol)),
    symbols.length
      ? sql`SELECT UPPER(ticker) AS symbol, date::text AS date, high, low, close
              FROM stocks.daily_ohlcv
             WHERE UPPER(ticker) = ANY(${symbols}::text[])
               AND date >= ${minDate}::date
               AND date <= ${today}::date`
      : Promise.resolve([]),
  ]);

  const chargeItems: PnlChargeItem[] = itemRows.map((row) => ({
    id: num(row.id),
    positionId: num(row.position_id),
    orderId: row.order_id == null ? null : num(row.order_id),
    side: String(row.side) === "SELL" ? "SELL" : "BUY",
    intraday: row.intraday === true,
    source: row.source === "kite" || row.source === "adjustment" ? row.source : "formula",
    brokerage: num(row.brokerage),
    stt: num(row.stt),
    exchange: num(row.exchange),
    sebi: num(row.sebi),
    stamp: num(row.stamp),
    gst: num(row.gst),
    dp: num(row.dp),
    total: num(row.total),
    ts: stamp(row.ts),
    dryRun: row.dry_run === true,
  }));

  const gtts: PnlGtt[] = gttRows.map((row) => ({
    positionId: num(row.position_id),
    triggerPrice: num(row.trigger_price),
    status: row.status == null ? undefined : String(row.status),
    history: asArray(row.history) as PnlGtt["history"],
  }));

  return buildPnl({
    positions,
    fills: fills.filter((fill) => fill.positionId > 0),
    chargeItems,
    ledger: ledgerRows.map((row) => ({
      id: num(row.id),
      kind: String(row.kind) as PnlLedgerRow["kind"],
      amount: num(row.amount),
      ts: stamp(row.ts),
      refOrderId: row.ref_order_id == null ? null : num(row.ref_order_id),
      dryRun: row.dry_run === true,
      note: row.note == null ? null : String(row.note),
    })),
    equity: equityRows.map((row) => ({ date: day(row.trade_date), value: num(row.system_value) })),
    marks: Object.fromEntries(symbols.map((symbol) => [symbol, marks.get(symbol) ?? null])),
    gtts,
    ohlcv: (bars as Record<string, unknown>[]).map((row): PnlBar => ({
      symbol: String(row.symbol),
      date: day(row.date),
      high: num(row.high),
      low: num(row.low),
      close: num(row.close),
    })),
    today,
    range,
    strategy,
    dryRun: includeDry,
    breakerPct: num(settings.breaker_pct ?? 0.25),
    maxPositions: num(settings.max_open_positions ?? 6),
  });
}
