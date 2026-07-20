import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/setup", "/_next", "/favicon.ico", "/api/", "/brand/", "/storefront"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Accept either the access token OR the refresh token — if only the refresh
  // token is present (access token expired), let the page through so client-side
  // code can call /api/auth/refresh and get a new access token automatically.
  const hasSession = request.cookies.has("jokas_at") || request.cookies.has("jokas_rt");

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
