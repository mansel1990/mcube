import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { pnlPayload } from "@/lib/mlive/pnl-load";
import type { PnlBook, PnlRange, PnlStrategyFilter } from "@/lib/mlive/pnl";

function rangeOf(value: string | null): PnlRange {
  if (value === "1m" || value === "3m") return value;
  return "all";
}

function strategyOf(value: string | null): PnlStrategyFilter {
  if (value === "rs" || value === "ema" || value === "orb" || value === "vwap") return value;
  return "all";
}

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const range = rangeOf(request.nextUrl.searchParams.get("range"));
  const strategy = strategyOf(request.nextUrl.searchParams.get("strategy"));
  const bookParam = request.nextUrl.searchParams.get("book");
  const book: PnlBook = bookParam === "swing" || bookParam === "intraday" ? bookParam : "all";
  return NextResponse.json(await pnlPayload(range, strategy, book));
}
