import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/setup", "/_next", "/favicon.ico", "/api/", "/brand/", "/storefront"];

// (M11) A per-request nonce + 'strict-dynamic' was tried here to block inline
// XSS payloads while letting Next's own hydration scripts run. It does NOT work
// with this app's Next.js 15.5 `output: "standalone"` build — Next never tags
// its framework/hydration <script> tags with the nonce (verified live on the
// VPS 2026-08-29), so 'strict-dynamic' blocked every script and the app
// rendered as a dead shell. Reverted to 'unsafe-inline' for script-src — the
// pre-M11 state it shipped with for months.
// TODO: revisit — force dynamic rendering on the authed pages, move CSP into
// next.config headers with static hashes, or wait for a Next.js fix.
// style-src keeps 'unsafe-inline' for React inline `style={{...}}`.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", CSP);
    return response;
  }

  // Accept either the access token OR the refresh token — if only the refresh
  // token is present (access token expired), let the page through so client-side
  // code can call /api/auth/refresh and get a new access token automatically.
  const hasSession = request.cookies.has("jokas_at") || request.cookies.has("jokas_rt");

  if (!hasSession) {
    // Relative Location — the browser resolves it against the real request URL.
    // `NextResponse.redirect(new URL("/login", request.url))` broke behind the
    // nginx reverse proxy: the standalone server's `request.url` reports its own
    // localhost:3000 bind address, not jokasfarms.com, so logged-out visitors
    // were bounced to https://localhost:3000/login. A relative redirect needs no
    // host detection at all.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: "/login", "Content-Security-Policy": CSP },
    });
  }

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CSP);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
