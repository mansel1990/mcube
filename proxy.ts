import { NextRequest, NextResponse } from "next/server";

// Cookie name used by Better Auth
const SESSION_COOKIE = "better-auth.session_token";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE);

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
