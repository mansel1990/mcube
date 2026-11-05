import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { chartsPayload } from "@/lib/mlive/read";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const range = request.nextUrl.searchParams.get("range") === "1m" ? "1m" : "all";
  return NextResponse.json(await chartsPayload(range));
}
