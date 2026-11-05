import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { saveEncryptedSession } from "@/lib/mlive/kite-session";
import { userAudit } from "@/lib/mlive/write";

const ALLOWED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "mcubetechstudio.com",
  "www.mcubetechstudio.com",
]);

function forwardTarget(value: string | null, currentOrigin: string): URL | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin === currentOrigin) return null;
  if (url.pathname !== "/api/mlive/kite/callback") return null;
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (local ? url.protocol !== "http:" : url.protocol !== "https:") return null;
  return url;
}

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  const here = request.nextUrl.origin;
  if (!session) return NextResponse.redirect(new URL("/auth/stocks-login?callbackUrl=%2Flive-trade-mansel%2Fsettings", here));

  const status = request.nextUrl.searchParams.get("status");
  const requestToken = request.nextUrl.searchParams.get("request_token");
  const next = forwardTarget(request.nextUrl.searchParams.get("next"), here);
  if (next && status && requestToken) {
    next.searchParams.set("status", status);
    next.searchParams.set("request_token", requestToken);
    return NextResponse.redirect(next);
  }

  if (status !== "success" || !requestToken) {
    return NextResponse.redirect(new URL("/live-trade-mansel/settings?kite=error", here));
  }
  try {
    const kiteUser = await saveEncryptedSession(session.user.id, requestToken);
    await userAudit({ userId: session.user.id, action: "kite.login", after: { kiteUser } });
    return NextResponse.redirect(new URL("/live-trade-mansel/settings?kite=connected", here));
  } catch {
    return NextResponse.redirect(new URL("/live-trade-mansel/settings?kite=error", here));
  }
}
