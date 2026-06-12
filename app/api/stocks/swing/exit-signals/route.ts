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
 * Latest EOD exit signals from the scanner (swing.exit_signals).
 * The table is created by the RS exit-engine backend (PRD §2.1 step 3);
 * until that lands, this returns an empty list instead of erroring.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = (await sql`
      SELECT symbol, strategy, reason, ref_price, date::text AS date
      FROM swing.exit_signals
      WHERE date = (SELECT MAX(date) FROM swing.exit_signals)
    `) as ExitSignalRow[];
    return NextResponse.json({ exits: rows });
  } catch {
    // Table not created yet (backend Phase 0a pending) — render dormant state
    return NextResponse.json({ exits: [] });
  }
}
