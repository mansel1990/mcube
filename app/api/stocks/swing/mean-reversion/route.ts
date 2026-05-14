import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";

export async function GET() {
  try {
    const rows = await sql`
      SELECT * FROM swing.mean_reversion_signals
      WHERE date = CURRENT_DATE
      ORDER BY volume_ratio DESC
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error("mean reversion signals fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch Mean Reversion signals" }, { status: 500 });
  }
}
