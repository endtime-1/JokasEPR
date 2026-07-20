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
// CRITICAL: auth-context and apiFetch both need to refresh tokens. If they each make
// independent HTTP calls to /api/auth/refresh, they race with the same old refresh token.
// The API rotates tokens on every use — the second call arrives with an already-revoked
// token and gets 401, which looks like a genuine session expiry and kicks the user to login.
//
// The singleton _refreshPromise is exported so auth-context can share it.
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

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
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

// Statuses that indicate the API server is temporarily unavailable (Hostinger 502 on cold start).
// These are retried once after a short wait before surfacing an error to the component.
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
      // This handles Hostinger cold starts where the API process is warming up
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

  // One automatic retry for transient server errors — handles Hostinger 502 on API cold start
  if (TRANSIENT_STATUSES.has(response.status)) {
    await new Promise<void>(r => setTimeout(r, 3000));
    response = await request(path, init);
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Retry after a successful refresh still got 401 — account issue or token mismatch
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
