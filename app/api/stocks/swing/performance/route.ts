import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { SIM_CAPITAL } from "@/lib/stocks/types";

const MANISH_INVESTMENT = SIM_CAPITAL;

const ML_STRATEGIES = [
  "s05_garch_volume",
  "s07_wavelet_volume",
  "sanjay_xgb_b8",
  "s08_gap_momentum",
  "s06_tcn_ohlcv",
  "s11_cluster_meanrev",
];

function mapMlToTrade(row: Record<string, unknown>) {
  const n = (v: unknown) => (v == null ? null : parseFloat(String(v)));
  const entryPrice = n(row.entry_price) ?? n(row.signal_close) ?? 0;
  const isClosed = row.status === "CLOSED";
  return {
    id: `ml-${row.trade_id}`,
    signal_date: String(row.signal_date).slice(0, 10),
    strategy: row.strategy,
    symbol: row.ticker,
    entry_price: entryPrice,
    target_price: n(row.target_price) ?? 0,
    stop_loss_price: n(row.stop_price) ?? 0,
    investment: n(row.invested_rs) ?? 0,
    exit_date: row.exit_date ? String(row.exit_date).slice(0, 10) : null,
    exit_price: n(row.exit_price),
    exit_reason: row.exit_reason ?? null,
    pnl: n(row.pnl_rs),
    // daily_suggestor stores fractions (0.0352 = 3.52%); swing tables store percent
    pnl_pct: n(row.pnl_pct) != null ? n(row.pnl_pct)! * 100 : null,
    status: isClosed ? "closed" : "open",
  };
}

type MappedTrade = ReturnType<typeof mapMlToTrade>;

function statsFor(strategy: string, trades: MappedTrade[]) {
  const closed = trades.filter((t) => t.status === "closed");
  const wins = closed.filter((t) => t.exit_reason === "target" || t.exit_reason === "target_hit").length;
  const losses = closed.filter((t) => t.exit_reason === "stop" || t.exit_reason === "stop_loss").length;
  const pnls = closed.map((t) => t.pnl ?? 0);
  const sum = pnls.reduce((s, p) => s + p, 0);
  return {
    strategy,
    total_trades: trades.length,
    closed_trades: closed.length,
    open_trades: trades.length - closed.length,
    wins,
    losses,
    total_pnl: sum,
    avg_pnl: closed.length ? sum / closed.length : 0,
    best_trade: pnls.length ? Math.max(...pnls) : 0,
    worst_trade: pnls.length ? Math.min(...pnls) : 0,
    avg_pnl_pct: closed.length
      ? closed.reduce((s, t) => s + (t.pnl_pct ?? 0), 0) / closed.length
      : 0,
  };
}

function mapManishToTrade(row: Record<string, unknown>) {
  const entryPrice = row.entry_price ? parseFloat(String(row.entry_price)) : 0;
  const exitPrice = row.exit_price ? parseFloat(String(row.exit_price)) : null;
  const pnlPct = row.pnl_pct ? parseFloat(String(row.pnl_pct)) : null;
  const isOpen = row.status === "OPEN";
  const pnl = pnlPct != null ? (MANISH_INVESTMENT * pnlPct) / 100 : null;

  return {
    id: `manish-${row.id}`,
    signal_date: String(row.signal_date).slice(0, 10),
    strategy: "manish",
    symbol: row.ticker,
    entry_price: entryPrice,
    target_price: 0,
    stop_loss_price: 0,
    investment: MANISH_INVESTMENT,
    exit_date: row.exit_date ? String(row.exit_date).slice(0, 10) : null,
    exit_price: exitPrice,
    exit_reason: row.exit_reason ?? null,
    pnl,
    pnl_pct: pnlPct,
    status: isOpen ? "open" : "closed",
  };
}

export async function GET() {
  try {
    const mlQuery = sql`
        SELECT trade_id, ticker, strategy, signal_date, status, signal_close,
               entry_price, target_price, stop_price, exit_date, exit_price,
               exit_reason, pnl_pct, pnl_rs, invested_rs
        FROM daily_suggestor.trades
        WHERE strategy = ANY(${ML_STRATEGIES}) AND status <> 'CANCELLED'
        ORDER BY signal_date DESC
        LIMIT 3000
      `.catch(() => [] as Record<string, unknown>[]);

    const [swingTrades, swingStats, manishRows, mlRows] = await Promise.all([
      sql`
        SELECT * FROM swing.strategy_performance
        WHERE signal_date >= CURRENT_DATE - INTERVAL '60 days'
        ORDER BY signal_date DESC, id DESC
      `,
      sql`
        SELECT
          strategy,
          COUNT(*)                                                        AS total_trades,
          COUNT(*) FILTER (WHERE status = 'closed')                      AS closed_trades,
          COUNT(*) FILTER (WHERE status = 'open')                        AS open_trades,
          COUNT(*) FILTER (WHERE exit_reason = 'target_hit')             AS wins,
          COUNT(*) FILTER (WHERE exit_reason = 'stop_loss')              AS losses,
          ROUND(COALESCE(SUM(pnl) FILTER (WHERE status='closed'), 0), 2) AS total_pnl,
          ROUND(COALESCE(AVG(pnl) FILTER (WHERE status='closed'), 0), 2) AS avg_pnl,
          ROUND(COALESCE(MAX(pnl) FILTER (WHERE status='closed'), 0), 2) AS best_trade,
          ROUND(COALESCE(MIN(pnl) FILTER (WHERE status='closed'), 0), 2) AS worst_trade,
          ROUND(COALESCE(AVG(pnl_pct) FILTER (WHERE status='closed'), 0),2) AS avg_pnl_pct
        FROM swing.strategy_performance
        GROUP BY strategy
        ORDER BY strategy
      `,
      // Manish scans run irregularly — no 60-day cutoff or his whole history
      // disappears from Demo Mode during quiet stretches. Full table is small.
      sql`
        SELECT id, signal_date, ticker, entry_price, status, exit_date, exit_price, pnl_pct, exit_reason
        FROM sim.stock_suggestions
        ORDER BY signal_date DESC
        LIMIT 1000
      `,
      // ML strategies from the daily_suggestor orchestrator (full paper book;
      // CANCELLED = never filled, excluded). Non-fatal if the schema moves.
      mlQuery,
    ]);

    const manishTrades = (manishRows as Record<string, unknown>[]).map(mapManishToTrade);

    const manishClosed = manishTrades.filter((t) => t.status === "closed");
    const manishOpen = manishTrades.filter((t) => t.status === "open");
    const manishWins = manishClosed.filter((t) => (t.pnl ?? 0) > 0).length;
    const manishLosses = manishClosed.filter((t) => (t.pnl ?? 0) < 0).length;

    const manishStats = manishTrades.length > 0 ? [{
      strategy: "manish",
      total_trades: manishTrades.length,
      closed_trades: manishClosed.length,
      open_trades: manishOpen.length,
      wins: manishWins,
      losses: manishLosses,
      total_pnl: manishClosed.reduce((s, t) => s + (t.pnl ?? 0), 0),
      avg_pnl: manishClosed.length ? manishClosed.reduce((s, t) => s + (t.pnl ?? 0), 0) / manishClosed.length : 0,
      best_trade: manishClosed.length ? Math.max(...manishClosed.map((t) => t.pnl ?? 0)) : 0,
      worst_trade: manishClosed.length ? Math.min(...manishClosed.map((t) => t.pnl ?? 0)) : 0,
      avg_pnl_pct: manishClosed.length ? manishClosed.reduce((s, t) => s + (t.pnl_pct ?? 0), 0) / manishClosed.length : 0,
    }] : [];

    const mlTrades = (mlRows as Record<string, unknown>[]).map(mapMlToTrade);
    const mlStats = ML_STRATEGIES.map((s) =>
      statsFor(s, mlTrades.filter((t) => t.strategy === s))
    ).filter((s) => s.total_trades > 0);

    const trades = [...manishTrades, ...mlTrades, ...(swingTrades as Record<string, unknown>[])].sort(
      (a, b) => {
        const da = String(a.signal_date);
        const db = String(b.signal_date);
        return db.localeCompare(da);
      }
    );

    const stats = [...manishStats, ...mlStats, ...(swingStats as Record<string, unknown>[])];

    return NextResponse.json({ trades, stats });
  } catch (err) {
    console.error("performance fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch performance data" }, { status: 500 });
  }
}
