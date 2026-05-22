import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";

export async function GET() {
  try {
    const rows = await sql`
      SELECT * FROM swing.vcp_signals
      WHERE date = (SELECT MAX(date) FROM swing.vcp_signals)
      ORDER BY volume_ratio DESC
    `;
    const signal_date = rows[0]?.date ?? null;
    return NextResponse.json({ signals: rows, signal_date });
  } catch (err) {
    console.error("vcp signals fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch VCP signals" }, { status: 500 });
  }
}
