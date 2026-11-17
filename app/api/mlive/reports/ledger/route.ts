import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { ledgerPayload } from "@/lib/mlive/read";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bookParam = request.nextUrl.searchParams.get("book");
  const book = bookParam === "swing" || bookParam === "intraday" ? bookParam : "all";
  return NextResponse.json(await ledgerPayload(book));
}
