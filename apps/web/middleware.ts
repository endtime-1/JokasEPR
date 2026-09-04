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
// (2026-09-04) nginx accepts both jokasfarms.com and www.jokasfarms.com on
// the same server block (infra/vps/nginx.conf) with no canonical redirect,
// but NEXT_PUBLIC_API_URL is pinned to the bare domain. A page loaded from
// www.jokasfarms.com has document origin www.jokasfarms.com, so its own
// fetches to https://jokasfarms.com/api/... don't match connect-src 'self'
// (different host) — every API call on that host was silently CSP-blocked,
// reported live as "some desktops" being unable to load anything. Listed
// explicitly here as a second line of defense alongside the www->apex
// redirect below (which removes the mismatch at the source for anyone who
// hits it after this deploys).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://jokasfarms.com https://www.jokasfarms.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Canonicalize the host BEFORE anything else — see the CSP comment above
  // for why serving the app from www. breaks every API call. 308 preserves
  // the HTTP method, so a client fetch (not just a browser navigation) that
  // somehow reaches www. is redirected correctly too, not downgraded to GET.
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  if (forwardedHost.startsWith("www.")) {
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const canonicalHost = forwardedHost.slice(4);
    const target = new URL(`${pathname}${request.nextUrl.search}`, `${proto}://${canonicalHost}`);
    const response = NextResponse.redirect(target, 308);
    response.headers.set("Content-Security-Policy", CSP);
    return response;
  }

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
    // Build the absolute URL from the proxied host, NOT request.url — behind
    // nginx the standalone server's request.url reports its own localhost:3000
    // bind address, so `new URL("/login", request.url)` sent logged-out
    // visitors to https://localhost:3000/login. Next.js middleware requires an
    // absolute URL for redirects (a relative one throws ERR_INVALID_URL).
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const response = NextResponse.redirect(new URL("/login", `${proto}://${host}`));
    response.headers.set("Content-Security-Policy", CSP);
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", CSP);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
