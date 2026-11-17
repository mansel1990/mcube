import { NextRequest, NextResponse } from "next/server";
import { benchmarkReport } from "@/lib/mlive/benchmark-load";
import { requireMliveSession } from "@/lib/mlive/auth";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const book = request.nextUrl.searchParams.get("book") ?? "all";
  return NextResponse.json(await benchmarkReport(book));
}
