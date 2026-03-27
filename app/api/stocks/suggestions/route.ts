import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/sql";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await sql`
    SELECT
      id, signal_date, ticker, peers,
      entry_z, peer_slope_pct,
      entry_date, entry_price,
      status, exit_date, exit_price,
      pnl_pct, hold_days, exit_reason,
      amount_invested
    FROM sim.stock_suggestions
    ORDER BY signal_date DESC
  `;

  return NextResponse.json(rows);
}
