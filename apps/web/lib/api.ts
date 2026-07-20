// In production the browser must call /api/v1/* on the same origin so Next.js
// can proxy the request to the internal NestJS process (via next.config rewrites).
// If NEXT_PUBLIC_API_URL is explicitly set (e.g. in dev or a custom deploy) use it;
// otherwise default to the relative path which works on any host.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api/v1").trim();

export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

// Tokens are now stored in HttpOnly cookies — these are stubs kept for call-site compatibility.
// The browser sends jokas_at / jokas_rt cookies automatically on every credentialed request.
export function getAccessToken(): string | null { return null; }
export function getRefreshToken(): string | null { return null; }
export function setSession(_accessToken: string, _refreshToken: string): void {}
export function clearSession(): void {}

// Three distinct refresh outcomes so callers don't conflate "API down" with "session expired".
//
// EXPORTED so auth-context can share this singleton instead of calling fetch() directly.
// If auth-context and apiFetch each make independent refresh requests with the same old
// token, the API rotates on first use and the second caller gets "token already revoked" →
// spurious auth:session-expired dispatch → user kicked to login.
export type RefreshResult = "ok" | "expired" | "unreachable";
let _refreshPromise: Promise<RefreshResult> | null = null;

export async function refreshSession(): Promise<RefreshResult> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
  })
    .then((r): RefreshResult => {
      if (r.ok) return "ok";
      if (r.status === 401 || r.status === 403) return "expired";
      return "unreachable"; // 502 / 503 / etc. — API is slow, not the user's fault
    })
    .catch((): RefreshResult => "unreachable") // network error
    .finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

// Abort a request after 12 seconds. Converts the AbortError to a synthetic 504 response
// so the TRANSIENT_STATUSES retry logic below handles it the same way as a real 504.
// Without this, a hanging NestJS API (e.g. PM2 restart on Hostinger) would leave fetch
// pending indefinitely and the component would show empty data forever.
async function request(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...init?.headers
      }
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return new Response(
        JSON.stringify({ message: "API server is not reachable. Please try again shortly." }),
        { status: 504, headers: { "content-type": "application/json" } }
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function extractErrorMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    const m = parsed.message;
    if (typeof m === "string") return m;
    if (Array.isArray(m) && m.length > 0) return String(m[0]);
  } catch {
    // text is already plain
  }
  return text;
}

function signalSessionExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth:session-expired"));
  }
}

// 502/503/504 indicate the NestJS process is temporarily unreachable (Hostinger cold start,
// PM2 restart, LiteSpeed proxy timeout). Retry once after a short wait instead of surfacing
// an error immediately — in practice the API responds on the second attempt.
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

import { authReady } from "./auth-gate";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Wait for auth-context to finish its initial session check before firing.
  // This guarantees the token refresh (if needed) is already done and the fresh jokas_at
  // cookie is in place before the first API request, eliminating the concurrent-refresh race.
  if (typeof window !== "undefined") {
    await authReady;
  }

  let response = await request(path, init);

  if (response.status === 401) {
    const refreshResult = await refreshSession();

    if (refreshResult === "ok") {
      // Got a fresh access token — retry the original request
      response = await request(path, init);
    } else if (refreshResult === "expired") {
      // Refresh token is genuinely invalid — session is over
      signalSessionExpired();
      throw new Error("Session expired. Please log in again.");
    } else {
      // API was unreachable during refresh — wait once and try the whole flow again
      await new Promise<void>(r => setTimeout(r, 3000));
      const retryResult = await refreshSession();
      if (retryResult === "ok") {
        response = await request(path, init);
      } else if (retryResult === "expired") {
        signalSessionExpired();
        throw new Error("Session expired. Please log in again.");
      } else {
        throw new Error("API server is not reachable. Please try again shortly.");
      }
    }
  }

  // One automatic retry for transient server errors — handles Hostinger 502/504 on cold start
  if (TRANSIENT_STATUSES.has(response.status)) {
    await new Promise<void>(r => setTimeout(r, 3000));
    response = await request(path, init);
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Retry after a successful refresh still got 401 — genuine auth failure
      signalSessionExpired();
    }
    throw new Error(extractErrorMessage(await response.text()));
  }

  const text = await response.text();
  if (!text) return {} as T;
  if (text.trimStart().startsWith("<")) {
    throw new Error("API server is not reachable. Please try again shortly.");
  }
  return JSON.parse(text) as T;
}

export async function downloadReport(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    throw new Error(extractErrorMessage(await response.text()));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
