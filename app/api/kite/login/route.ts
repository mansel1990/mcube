import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { getKiteLoginUrl } from "@/lib/kite/client";

export async function GET() {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.KITE_API_KEY) {
    return NextResponse.json({ error: "Kite API not configured" }, { status: 503 });
  }

  const loginUrl = getKiteLoginUrl();
  redirect(loginUrl);
}
