import { sql } from "@/lib/sql";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const rows = await sql`
      SELECT * FROM swing.fear_reversion_signals
      WHERE date = CURRENT_DATE
      ORDER BY volume_ratio DESC
    `;
    return NextResponse.json({ signals: rows });
  } catch {
    return NextResponse.json({ signals: [] });
  }
}
