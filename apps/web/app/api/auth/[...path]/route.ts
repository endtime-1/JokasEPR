import { type NextRequest, NextResponse } from "next/server";

// Prefer the internal URL (server-to-server) to avoid a round-trip through LiteSpeed.
const API_BASE = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api/v1").trim();

// Hostinger hibernates the NestJS process after ~10 min idle; waking it observed at
// 15-40s (same numbers as apps/web/lib/api.ts's apiFetch, which every OTHER API call
// in this app goes through). This proxy is the one path that bypassed that hardening
// entirely — login/refresh/logout/me all route through here with no timeout and no
// retry, so a user hitting a cold start on login (the single most likely moment to
// hit one, since it's often the first request after being away) saw an immediate,
// non-recoverable "Server error" instead of the same transparent 30s ride-out every
// other page gets. Mirrors apiFetch's transient-retry loop, adapted for a server-side
// route handler (a per-attempt AbortController timeout instead of relying on the
// browser, since a hung upstream connection here would otherwise block indefinitely).
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const MAX_TRANSIENT_RETRIES = 10;
const RETRY_DELAY_MS = 3000;
const ATTEMPT_TIMEOUT_MS = 12000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchUpstream(upstreamUrl: string, method: string, headers: HeadersInit, body: string | undefined): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    return await fetch(upstreamUrl, { method, headers, body, signal: controller.signal });
  } catch {
    // Network failure, connection refused, or our own abort — all treated as a
    // transient synthetic 503 so the retry loop below handles them uniformly.
    return new Response(JSON.stringify({ message: "API unreachable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function proxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const upstreamUrl = `${API_BASE}/auth/${segments.join("/")}`;

  const forwardHeaders: HeadersInit = { "content-type": "application/json" };
  const cookie = request.headers.get("cookie");
  if (cookie) forwardHeaders["cookie"] = cookie;

  const body = request.method === "GET" ? undefined : await request.text();

  let upstream = await fetchUpstream(upstreamUrl, request.method, forwardHeaders, body);

  let retries = 0;
  while (TRANSIENT_STATUSES.has(upstream.status) && retries < MAX_TRANSIENT_RETRIES) {
    retries++;
    await sleep(RETRY_DELAY_MS);
    upstream = await fetchUpstream(upstreamUrl, request.method, forwardHeaders, body);
  }

  const payload = await upstream.text();

  const response = new NextResponse(payload, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });

  // Copy every Set-Cookie header so cookies are owned by localhost:3000,
  // making them visible to the Next.js middleware.
  for (const value of upstream.headers.getSetCookie()) {
    response.headers.append("set-cookie", value);
  }

  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(request, path);
}
