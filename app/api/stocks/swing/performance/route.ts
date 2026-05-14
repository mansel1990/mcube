import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";

export async function GET() {
  try {
    const [trades, stats] = await Promise.all([
      // Last 60 days of trades, newest first
      sql`
        SELECT * FROM swing.strategy_performance
        WHERE signal_date >= CURRENT_DATE - INTERVAL '60 days'
        ORDER BY signal_date DESC, id DESC
      `,
      // Aggregate stats per strategy
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
    ]);

    return NextResponse.json({ trades, stats });
  } catch (err) {
    console.error("performance fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch performance data" }, { status: 500 });
  }
}
