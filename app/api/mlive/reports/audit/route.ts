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
  const q = request.nextUrl.searchParams.get("q");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const book = request.nextUrl.searchParams.get("book");
  const who = request.nextUrl.searchParams.get("who");
  const type = request.nextUrl.searchParams.get("type");
  return NextResponse.json(await auditPayload({ page, view, group, symbol, q, from, to, book, who, type }));
}
