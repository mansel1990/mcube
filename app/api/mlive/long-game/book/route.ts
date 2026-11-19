import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { nextTradingDay, todayIst } from "@/lib/mlive/calendar";
import { buildLongGamePresentation, type CloseInput, type LedgerInput, type LotInput, type MarkInput } from "@/lib/mlive/long-game-value";
import { loadNiftyCloses, loadSymbolCloses } from "@/lib/mlive/nifty";
import { sql } from "@/lib/sql";

type Setting = { key: string; value: unknown };
type Holding = { pocket: string; symbol: string; units: unknown; avg_price: unknown };
type EventRow = { symbol: string; status: string; note: string | null; units: unknown };
type Ledger = { kind: string; amount: unknown; pocket: string; symbol?: unknown; units?: unknown; price?: unknown; created_at?: unknown };
type Pending = { id: unknown; pocket: string; reason: string; suggested_inr: unknown; expires_on: string | null };
type SuggestionRow = { created_at: unknown; pocket: string; status: string; reason: string; suggested_inr: unknown; selected_inr: unknown };
type LotRow = {
  id: unknown;
  pocket: string;
  symbol: string;
  qty_open: unknown;
  qty_original: unknown;
  price: unknown;
  acquired_on: unknown;
  acquisition_date: unknown;
  tax_date_assumption: unknown;
  registered_on: unknown;
  estimated: unknown;
};
type MarkRow = { symbol: string; price: unknown; observed_at: unknown };
type HistoryItem = { date: string; pocket: "Core" | "Radar"; what: string; moneyAdded: number | null; status: string };

function on(value: unknown): boolean {
  return value === true || value === "true";
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function day(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await sql`SELECT key, value FROM mlive.mlive_settings WHERE key IN ('longterm_core_enabled', 'longterm_radar_enabled', 'longterm_secondary', 'longterm_max_changes_per_year')` as Setting[];
    const map = new Map(settings.map((row) => [row.key, row.value]));
    const secondary = typeof map.get("longterm_secondary") === "string" ? String(map.get("longterm_secondary")).replace(/"/g, "") : "mid";
    const holdings = await sql`SELECT pocket, symbol, units, avg_price FROM mlive.mlive_longgame_holdings` as Holding[];
    const ledger = await sql`SELECT kind, amount, pocket, symbol, units, price, note, created_at::text AS created_at FROM mlive.mlive_longgame_ledger` as Ledger[];
    const lots = await sql`SELECT id, pocket, symbol, qty_open, qty_original, price, acquired_on::text AS acquired_on, acquisition_date::text AS acquisition_date, tax_date_assumption, registered_on::text AS registered_on, estimated FROM mlive.mlive_longgame_lots WHERE qty_open > 0 ORDER BY acquired_on, id` as LotRow[];
    let marks: MarkRow[] = [];
    try {
      marks = await sql`SELECT symbol, price, observed_at::text AS observed_at FROM mlive.mlive_longgame_marks` as MarkRow[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("mlive_longgame_marks")) throw error;
    }
    const holidays = await sql`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`;
    const cashRows = await sql`SELECT COALESCE(SUM(CASE kind WHEN 'deposit' THEN amount WHEN 'sale_proceeds' THEN amount WHEN 'withdrawal' THEN -amount WHEN 'charges' THEN -amount WHEN 'tax' THEN -amount ELSE 0 END), 0) AS cash FROM mlive.mlive_longgame_ledger WHERE pocket = 'core'` as { cash: unknown }[];
    const pending = await sql`SELECT id, pocket, reason, suggested_inr, expires_on::text AS expires_on FROM mlive.mlive_longgame_suggestions WHERE status = 'pending' ORDER BY id LIMIT 1` as Pending[];
    const events = await sql`SELECT symbol, status, note, units FROM mlive.mlive_longgame_reconcile WHERE status IN ('needs_you', 'untracked') ORDER BY id DESC LIMIT 20` as EventRow[];
    const suggestions = await sql`SELECT created_at::text AS created_at, pocket, status, reason, suggested_inr, selected_inr FROM mlive.mlive_longgame_suggestions WHERE status <> 'pending' ORDER BY id DESC LIMIT 30` as SuggestionRow[];
    const moves = await sql`SELECT COUNT(*)::int AS n FROM mlive.mlive_longgame_suggestions WHERE pocket = 'radar' AND status = 'approved' AND decided_at >= date_trunc('year', now())` as { n: number }[];

    const lotInputs: LotInput[] = lots.map((row) => ({
      id: num(row.id),
      pocket: row.pocket,
      symbol: String(row.symbol).toUpperCase(),
      qtyOpen: num(row.qty_open),
      qtyOriginal: num(row.qty_original),
      price: num(row.price),
      acquiredOn: day(row.acquired_on),
      acquisitionDate: row.acquisition_date ? day(row.acquisition_date) : null,
      taxDateAssumption: String(row.tax_date_assumption ?? ""),
      registeredOn: row.registered_on ? day(row.registered_on) : null,
      estimated: row.estimated === true,
    }));
    const ledgerInputs: LedgerInput[] = ledger.map((row) => ({
      kind: row.kind,
      amount: num(row.amount),
      pocket: row.pocket,
      symbol: row.symbol == null ? null : String(row.symbol),
      units: num(row.units),
      createdAt: day(row.created_at),
    }));
    const markInputs: MarkInput[] = marks.map((row) => ({
      symbol: String(row.symbol).toUpperCase(),
      price: num(row.price),
      observedAt: String(row.observed_at),
    }));
    const symbols = [...new Set(holdings.filter((row) => row.pocket === "core").map((row) => String(row.symbol).toUpperCase()))];
    const firstLot = lotInputs.map((row) => row.acquiredOn).filter(Boolean).sort()[0] ?? "2026-03-01";
    const nifty = await loadNiftyCloses(firstLot);
    const symbolCloses = await loadSymbolCloses(symbols, firstLot);
    const pricesUnavailable = nifty.reason === "no-url" || nifty.reason === "unreachable" || symbolCloses.reason === "no-url" || symbolCloses.reason === "unreachable";
    const closes: CloseInput[] = pricesUnavailable ? [] : symbolCloses.rows;
    const sessions = pricesUnavailable ? [] : nifty.closes.map((row) => row.date);
    const book = buildLongGamePresentation({
      today: todayIst(),
      holdings: holdings.map((row) => ({
        pocket: row.pocket,
        symbol: String(row.symbol).toUpperCase(),
        units: num(row.units),
        average: num(row.avg_price),
      })),
      ledger: ledgerInputs,
      lots: lotInputs,
      marks: markInputs,
      closes,
      nifty: pricesUnavailable ? [] : nifty.closes,
      sessions,
      cash: num(cashRows[0]?.cash),
      pricesUnavailable,
    });

    const history: HistoryItem[] = [];
    for (const row of suggestions) {
      const done = row.status === "approved";
      history.push({
        date: day(row.created_at),
        pocket: row.pocket === "radar" ? "Radar" : "Core",
        what: row.reason,
        moneyAdded: done && num(row.selected_inr) > 0 ? num(row.selected_inr) : null,
        status: done ? "Done" : row.status === "rejected" ? "Rejected" : "Expired",
      });
    }
    for (const row of ledger) {
      if (row.kind !== "opening_holding") continue;
      const units = num(row.units);
      const price = num(row.price);
      history.push({
        date: day(row.created_at),
        pocket: row.pocket === "radar" ? "Radar" : "Core",
        what: `Opening holding registered: ${String(row.symbol ?? "").toUpperCase()} ${units} units at ₹${price} average`,
        moneyAdded: num(row.amount) > 0 ? num(row.amount) : null,
        status: "Registered",
      });
    }
    history.sort((a, b) => b.date.localeCompare(a.date));
    const untracked: { symbol: string; units: number; note: string }[] = [];
    const needsYou: { symbol: string; units: number; note: string }[] = [];
    for (const row of events) {
      const item = { symbol: row.symbol, units: num(row.units), note: row.note ?? "" };
      if (row.status === "needs_you") needsYou.push(item);
      else untracked.push(item);
    }

    return NextResponse.json({
      core: on(map.get("longterm_core_enabled")),
      radar: on(map.get("longterm_radar_enabled")),
      secondary,
      radarBlocked: secondary === "next" || !on(map.get("longterm_radar_enabled")),
      radarMoves: num(moves[0]?.n),
      radarCap: num(map.get("longterm_max_changes_per_year")) || 12,
      value: book.value,
      moneyAdded: book.moneyAdded,
      gain: book.gain,
      gainPct: book.gainPct,
      cash: book.cash,
      priceCaption: book.priceCaption,
      pricesAtCost: book.pricesAtCost,
      chartNote: book.chartNote,
      longReturnPct: book.longReturnPct,
      niftyReturnPct: book.niftyReturnPct,
      vsNiftyPp: book.vsNiftyPp,
      niftyAdjustments: book.niftyAdjustments,
      holdings: book.holdings,
      lots: book.lots,
      chart: book.chart,
      niftySameDatesPct: book.vsNiftyPp,
      pocketMoney: { core: book.moneyAdded, radar: 0 },
      pockets: { core: book.value, radar: 0 },
      pending: pending[0]
        ? { id: num(pending[0].id), pocket: pending[0].pocket, reason: pending[0].reason, suggested: num(pending[0].suggested_inr), expiresOn: pending[0].expires_on }
        : null,
      untracked,
      needsYou,
      history,
      nextCheck: nextTradingDay(todayIst(), new Set(holidays.map((row) => String(row.trade_date).slice(0, 10)))),
    });
  } catch (error) {
    console.error("long game book:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Long Game book could not be loaded." }, { status: 503 });
  }
}
