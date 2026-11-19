import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { nextTradingDay, todayIst } from "@/lib/mlive/calendar";
import { sql } from "@/lib/sql";

type Setting = { key: string; value: unknown };
type Holding = { pocket: string; symbol: string; units: unknown; avg_price: unknown };
type EventRow = { symbol: string; status: string; note: string | null; units: unknown };
type Ledger = { kind: string; amount: unknown; pocket: string };
type Pending = { id: unknown; pocket: string; reason: string; suggested_inr: unknown; expires_on: string | null };

function on(value: unknown): boolean {
  return value === true || value === "true";
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await sql`SELECT key, value FROM mlive.mlive_settings WHERE key IN ('longterm_core_enabled', 'longterm_radar_enabled', 'longterm_secondary', 'longterm_max_changes_per_year')` as Setting[];
  const map = new Map(settings.map((row) => [row.key, row.value]));
  const secondary = typeof map.get("longterm_secondary") === "string" ? String(map.get("longterm_secondary")).replace(/"/g, "") : "mid";
  const core = on(map.get("longterm_core_enabled"));
  const radar = on(map.get("longterm_radar_enabled"));
  const empty = {
    core,
    radar,
    secondary,
    radarBlocked: secondary === "next" || !radar,
    radarMoves: 0,
    radarCap: num(map.get("longterm_max_changes_per_year")) || 12,
    value: 0,
    moneyAdded: 0,
    gain: 0,
    nifty: 0,
    pockets: { core: 0, radar: 0 },
    pending: null as { id: number; pocket: string; reason: string; suggested: number; expiresOn: string | null } | null,
    untracked: [] as { symbol: string; units: number; note: string }[],
    needsYou: [] as { symbol: string; units: number; note: string }[],
    history: [] as { kind: string; amount: number; pocket: string }[],
    holdings: [] as { pocket: string; symbol: string; units: number; average: number; value: number }[],
    nextCheck: nextTradingDay(todayIst(), new Set()),
  };
  try {
    const holdings = await sql`SELECT pocket, symbol, units, avg_price FROM mlive.mlive_longgame_holdings` as Holding[];
    for (const row of holdings) {
      const worth = num(row.units) * num(row.avg_price);
      empty.value += worth;
      if (row.pocket === "radar") empty.pockets.radar += worth;
      else empty.pockets.core += worth;
      if (String(row.symbol).toUpperCase() === "NIFTYBEES") empty.nifty += worth;
      empty.holdings.push({
        pocket: row.pocket,
        symbol: String(row.symbol).toUpperCase(),
        units: num(row.units),
        average: num(row.avg_price),
        value: worth,
      });
    }
    const holidays = await sql`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`;
    empty.nextCheck = nextTradingDay(todayIst(), new Set(holidays.map((row) => String(row.trade_date).slice(0, 10))));
    const ledger = await sql`SELECT kind, amount, pocket FROM mlive.mlive_longgame_ledger WHERE kind IN ('deposit', 'opening_holding')` as Ledger[];
    empty.moneyAdded = ledger.reduce((sum, row) => sum + num(row.amount), 0);
    empty.gain = empty.value - empty.moneyAdded;
    const pending = await sql`SELECT id, pocket, reason, suggested_inr, expires_on::text AS expires_on FROM mlive.mlive_longgame_suggestions WHERE status = 'pending' ORDER BY id LIMIT 1` as Pending[];
    if (pending[0]) {
      empty.pending = {
        id: num(pending[0].id),
        pocket: pending[0].pocket,
        reason: pending[0].reason,
        suggested: num(pending[0].suggested_inr),
        expiresOn: pending[0].expires_on,
      };
    }
    const events = await sql`SELECT symbol, status, note, units FROM mlive.mlive_longgame_reconcile WHERE status IN ('needs_you', 'untracked') ORDER BY id DESC LIMIT 20` as EventRow[];
    for (const row of events) {
      const item = { symbol: row.symbol, units: num(row.units), note: row.note ?? "" };
      if (row.status === "needs_you") empty.needsYou.push(item);
      else empty.untracked.push(item);
    }
    const history = await sql`SELECT kind, amount, pocket FROM mlive.mlive_longgame_ledger ORDER BY id DESC LIMIT 8` as Ledger[];
    empty.history = history.map((row) => ({ kind: row.kind, amount: num(row.amount), pocket: row.pocket }));
    const moves = await sql`SELECT COUNT(*)::int AS n FROM mlive.mlive_longgame_suggestions WHERE pocket = 'radar' AND status = 'approved' AND decided_at >= date_trunc('year', now())` as { n: number }[];
    empty.radarMoves = num(moves[0]?.n);
  } catch {
    return NextResponse.json(empty);
  }
  return NextResponse.json(empty);
}
