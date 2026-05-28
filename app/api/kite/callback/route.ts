import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createKiteClient } from "@/lib/kite/client";
import { getTodayIST, saveKiteSession } from "@/lib/kite/session";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return NextResponse.redirect(new URL("/auth/stocks-login", request.url));
  }

  const status = request.nextUrl.searchParams.get("status");
  const requestToken = request.nextUrl.searchParams.get("request_token");
  const base = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  if (status !== "success" || !requestToken) {
    return NextResponse.redirect(new URL("/stocks/settings?kite=error", base));
  }

  const apiSecret = process.env.KITE_API_SECRET;
  if (!apiSecret) {
    return NextResponse.redirect(new URL("/stocks/settings?kite=config", base));
  }

  try {
    const kite = createKiteClient();
    const response = await kite.generateSession(requestToken, apiSecret);
    await saveKiteSession(session.user.id, response.access_token, getTodayIST());
    return NextResponse.redirect(new URL("/stocks/settings?kite=connected", base));
  } catch {
    return NextResponse.redirect(new URL("/stocks/settings?kite=error", base));
  }
}
