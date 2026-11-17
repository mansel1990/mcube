import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { dailyReport } from "@/lib/mlive/daily";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const day = request.nextUrl.searchParams.get("day");
  return NextResponse.json(await dailyReport(day));
}
