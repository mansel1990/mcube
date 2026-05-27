import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { SIM_CAPITAL } from "@/lib/stocks/types";

const MANISH_INVESTMENT = SIM_CAPITAL;

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
    const [swingTrades, swingStats, manishRows] = await Promise.all([
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
      sql`
        SELECT id, signal_date, ticker, entry_price, status, exit_date, exit_price, pnl_pct, exit_reason
        FROM sim.stock_suggestions
        WHERE signal_date >= CURRENT_DATE - INTERVAL '60 days'
        ORDER BY signal_date DESC
      `,
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

    const trades = [...manishTrades, ...(swingTrades as Record<string, unknown>[])].sort((a, b) => {
      const da = String(a.signal_date);
      const db = String(b.signal_date);
      return db.localeCompare(da);
    });

    const stats = [...manishStats, ...(swingStats as Record<string, unknown>[])];

    return NextResponse.json({ trades, stats });
  } catch (err) {
    console.error("performance fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch performance data" }, { status: 500 });
  }
}
