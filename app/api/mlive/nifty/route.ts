import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { loadNiftyCloses } from "@/lib/mlive/nifty";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const from = request.nextUrl.searchParams.get("from") ?? "2000-01-01";
  const to = request.nextUrl.searchParams.get("to") ?? "2100-01-01";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ closes: [], reason: null });
  }
  const nifty = await loadNiftyCloses(from, to);
  return NextResponse.json({ closes: nifty.closes, reason: nifty.reason });
}
