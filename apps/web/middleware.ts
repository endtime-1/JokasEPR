import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/setup", "/_next", "/favicon.ico", "/api/", "/brand/", "/storefront"];

// (M11) script-src previously carried 'unsafe-inline', which lets ANY inline
// <script> execute — the exact primitive a reflected/stored-XSS payload needs.
// A per-request nonce lets Next.js's own hydration scripts keep running while
// an attacker-injected inline script (which can't know the nonce in advance)
// gets blocked by the browser. style-src keeps 'unsafe-inline' deliberately:
// this app uses React inline `style={{...}}` in ~15 files, and CSP has no
// reliable nonce/hash equivalent for the style="" HTML attribute (only for
// <style> elements) across the browsers we need to support.
function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  // Accept either the access token OR the refresh token — if only the refresh
  // token is present (access token expired), let the page through so client-side
  // code can call /api/auth/refresh and get a new access token automatically.
  const hasSession = request.cookies.has("jokas_at") || request.cookies.has("jokas_rt");

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
