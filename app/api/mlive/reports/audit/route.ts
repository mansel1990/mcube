import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { auditPayload } from "@/lib/mlive/read";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const page = Number(request.nextUrl.searchParams.get("page") ?? 0);
  const view = request.nextUrl.searchParams.get("view") ?? "all";
  const group = request.nextUrl.searchParams.get("group") ?? "all";
  const symbol = request.nextUrl.searchParams.get("symbol");
  return NextResponse.json(await auditPayload({ page, view, group, symbol }));
}
