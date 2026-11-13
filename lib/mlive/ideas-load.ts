import { sql } from "@/lib/sql";
import { todayIst } from "./calendar";
import {
  buildIdeas,
  summariseIdeas,
  type BuiltIdea,
  type IdeaBar,
  type IdeaDecision,
  type IdeaOrder,
  type IdeaPosition,
  type IdeaRow,
  type IdeaStrategy,
  type IdeaSummary,
} from "./ideas";
import { settingsMap } from "./read";

export type IdeasPayload = {
  today: string;
  view: "today" | "history";
  strategy: "all" | "rs" | "ema";
  from: string | null;
  to: string | null;
  scanDate: string | null;
  validFor: string | null;
  lastScan: { scanDate: string; validFor: string } | null;
  summary: IdeaSummary;
  ideas: BuiltIdea[];
};

function shift(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function day(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

function exitGap(settings: Record<string, unknown>, key: string): number {
  const raw = settings[key];
  let value: unknown = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw) as unknown; } catch { value = null; }
  }
  const gap = value && typeof value === "object" ? Number((value as { gtt_gap_pct?: unknown }).gtt_gap_pct) : Number.NaN;
  return Number.isFinite(gap) && gap >= 0 && gap < 1 ? gap : 0.03;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function strategyOf(value: unknown): IdeaStrategy {
  return String(value) === "ema" ? "ema" : "rs";
}

function sizingOf(value: unknown): IdeaDecision["sizing"] {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    qty: num(row.qty),
    limit: num(row.limit),
    stop: num(row.stop),
    notional: num(row.notional),
  };
}

export async function ideasBadge(): Promise<{ waiting: number }> {
  const today = todayIst();
  const settings = await settingsMap();
  const includeDry = settings.dry_run !== false;
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT DISTINCT ON (i.id) d.outcome
        FROM mlive.mlive_ideas i
        JOIN mlive.mlive_decisions d ON d.idea_id = i.id AND d.side = 'BUY'
       WHERE i.valid_for = ${today}::date
         AND (${includeDry}::boolean OR d.dry_run = false)
       ORDER BY i.id, d.id DESC
    ) latest
    WHERE outcome = 'proposed'`;
  return { waiting: num(rows[0]?.n) };
}

export async function loadIdeas(query: {
  view?: string | null;
  strategy?: string | null;
  from?: string | null;
  to?: string | null;
  range?: string | null;
}): Promise<IdeasPayload> {
  const today = todayIst();
  const view = query.view === "history" ? "history" : "today";
  const strategy = query.strategy === "rs" || query.strategy === "ema" ? query.strategy : "all";
  const settings = await settingsMap();
  const includeDry = settings.dry_run !== false;
  let from: string | null = null;
  let to: string | null = null;
  if (view === "history" && query.range !== "all") {
    const span = query.range === "30" ? 29 : 6;
    from = query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : shift(today, -span);
    to = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : today;
  }

  const ideaRows = view === "today"
    ? await sql`
        SELECT id, scan_date::text AS scan_date, valid_for::text AS valid_for, symbol, strategy, score,
               signal_close, initial_stop, sector, raw
          FROM mlive.mlive_ideas
         WHERE valid_for = ${today}::date
           AND (${strategy} = 'all' OR strategy = ${strategy})
         ORDER BY score DESC, symbol`
    : await sql`
        SELECT id, scan_date::text AS scan_date, valid_for::text AS valid_for, symbol, strategy, score,
               signal_close, initial_stop, sector, raw
          FROM mlive.mlive_ideas
         WHERE (${from}::date IS NULL OR scan_date >= ${from}::date)
           AND (${to}::date IS NULL OR scan_date <= ${to}::date)
           AND (${strategy} = 'all' OR strategy = ${strategy})
         ORDER BY scan_date DESC, score DESC, symbol`;

  const lastRows = await sql`
    SELECT scan_date::text AS scan_date, valid_for::text AS valid_for
      FROM mlive.mlive_ideas
     ORDER BY scan_date DESC, id DESC
     LIMIT 1`;
  const lastScan = lastRows[0]
    ? { scanDate: day(lastRows[0].scan_date), validFor: day(lastRows[0].valid_for) }
    : null;

  const ideasIn: IdeaRow[] = ideaRows.map((row) => ({
    id: num(row.id),
    scanDate: day(row.scan_date),
    validFor: day(row.valid_for),
    symbol: String(row.symbol),
    strategy: strategyOf(row.strategy),
    score: num(row.score),
    signalClose: num(row.signal_close),
    initialStop: row.initial_stop == null ? null : num(row.initial_stop),
    sector: row.sector == null ? null : String(row.sector),
    raw: row.raw && typeof row.raw === "object" ? row.raw as Record<string, unknown> : null,
  }));

  const ids = ideasIn.map((row) => row.id);
  const decisions: IdeaDecision[] = ids.length
    ? (await sql`
        SELECT DISTINCT ON (idea_id)
               id, idea_id, trade_date::text AS trade_date, outcome, reason_code, sizing, position_id
          FROM mlive.mlive_decisions
         WHERE idea_id = ANY(${ids}::bigint[])
           AND side = 'BUY'
           AND (${includeDry}::boolean OR dry_run = false)
         ORDER BY idea_id, id DESC`).map((row) => ({
        id: num(row.id),
        ideaId: num(row.idea_id),
        tradeDate: day(row.trade_date),
        outcome: String(row.outcome),
        reasonCode: row.reason_code == null ? null : String(row.reason_code),
        sizing: sizingOf(row.sizing),
        positionId: row.position_id == null ? null : num(row.position_id),
      }))
    : [];

  const decisionIds = decisions.map((row) => row.id);
  const orders: IdeaOrder[] = decisionIds.length
    ? (await sql`
        SELECT id, decision_id, side, status, qty, filled_qty, avg_price
          FROM mlive.mlive_orders
         WHERE decision_id = ANY(${decisionIds}::bigint[])
           AND (${includeDry}::boolean OR dry_run = false)`).map((row) => ({
        id: num(row.id),
        decisionId: row.decision_id == null ? null : num(row.decision_id),
        side: String(row.side) === "SELL" ? "SELL" as const : "BUY" as const,
        status: String(row.status ?? ""),
        qty: num(row.qty),
        filled: num(row.filled_qty),
        avgPrice: row.avg_price == null ? null : num(row.avg_price),
      }))
    : [];

  const symbols = [...new Set(ideasIn.map((row) => row.symbol))];
  const positions: IdeaPosition[] = symbols.length
    ? (await sql`
        SELECT id, symbol, strategy, qty, avg_price, realised_pnl, closed_at,
               (opened_at AT TIME ZONE 'Asia/Kolkata')::date::text AS opened_on
          FROM mlive.mlive_positions
         WHERE symbol = ANY(${symbols}::text[])
           AND (${includeDry}::boolean OR dry_run = false)`).map((row) => ({
        id: num(row.id),
        symbol: String(row.symbol),
        strategy: row.strategy == null ? null : strategyOf(row.strategy),
        qty: num(row.qty),
        avgPrice: num(row.avg_price),
        openedOn: day(row.opened_on),
        closed: row.closed_at != null,
        realisedPnl: num(row.realised_pnl),
      }))
    : [];

  const earliest = ideasIn.reduce((min, row) => (row.scanDate < min ? row.scanDate : min), today);
  const bars: IdeaBar[] = symbols.length
    ? (await sql`
        SELECT UPPER(ticker) AS symbol, date::text AS date, close, high, low
          FROM stocks.daily_ohlcv
         WHERE UPPER(ticker) = ANY(${symbols}::text[])
           AND date >= ${shift(earliest, -90)}::date
           AND date <= ${today}::date
         ORDER BY date`).map((row) => ({
        symbol: String(row.symbol),
        date: day(row.date),
        close: num(row.close),
        high: row.high == null ? null : num(row.high),
        low: row.low == null ? null : num(row.low),
      }))
    : [];

  const ideas = buildIdeas(ideasIn, decisions, orders, positions, bars, today, {
    rs: exitGap(settings, "exit.rs"),
    ema: exitGap(settings, "exit.ema"),
  });
  const scanDate = ideas[0]?.scanDate ?? null;
  const validFor = ideas[0]?.validFor ?? null;
  return {
    today,
    view,
    strategy,
    from,
    to,
    scanDate,
    validFor,
    lastScan,
    summary: summariseIdeas(ideas),
    ideas,
  };
}
