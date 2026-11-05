import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { kiteLoginUrl } from "@/lib/mlive/kite-session";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let url: string;
  try {
    url = kiteLoginUrl(request.nextUrl.origin);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kite login is not configured" }, { status: 503 });
  }
  return NextResponse.redirect(url);
}
