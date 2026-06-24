import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/sql";

export type ExitSignalRow = {
  symbol: string;
  strategy: string;
  reason: string;
  ref_price: number | null;
  date: string;
};

/**
 * Latest EOD exit signals:
 * - swing.exit_signals (RS/EMA trend-break engine, when wired)
 * - daily_suggestor.trades CLOSED on the latest exit date (ML resolver: target/stop/time)
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exits: ExitSignalRow[] = [];

  try {
    const swingRows = (await sql`
      SELECT symbol, strategy, reason, ref_price, date::text AS date
      FROM swing.exit_signals
      WHERE date = (SELECT MAX(date) FROM swing.exit_signals)
    `) as ExitSignalRow[];
    exits.push(...swingRows);
  } catch {
    // Table not created yet — skip
  }

  try {
    const mlRows = (await sql`
      SELECT ticker AS symbol, strategy, exit_reason AS reason,
             exit_price AS ref_price, exit_date::text AS date
      FROM daily_suggestor.trades
      WHERE status = 'CLOSED'
        AND exit_date = (
          SELECT MAX(exit_date) FROM daily_suggestor.trades WHERE status = 'CLOSED'
        )
    `) as ExitSignalRow[];
    exits.push(...mlRows);
  } catch {
    // Schema unreachable — skip
  }

  return NextResponse.json({ exits });
}
