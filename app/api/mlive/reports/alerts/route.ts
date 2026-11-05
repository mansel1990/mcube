import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { alertsPayload } from "@/lib/mlive/read";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const page = Math.max(0, Number(request.nextUrl.searchParams.get("page") ?? 0) || 0);
  return NextResponse.json(await alertsPayload(page));
}
