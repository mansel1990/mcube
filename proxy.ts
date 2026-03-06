import { NextRequest, NextResponse } from "next/server";

// Better Auth uses __Secure- prefix in production (https baseURL), plain name in dev
const SESSION_COOKIE = "better-auth.session_token";
const SECURE_SESSION_COOKIE = "__Secure-better-auth.session_token";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie =
    request.cookies.get(SECURE_SESSION_COOKIE) ||
    request.cookies.get(SESSION_COOKIE);

  if (pathname.startsWith("/stocks")) {
    if (!sessionCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/stocks-login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!sessionCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/admin-login";
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/stocks/:path*", "/admin/:path*"],
};
