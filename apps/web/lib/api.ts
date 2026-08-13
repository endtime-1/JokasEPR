// In production the browser must call /api/v1/* on the same origin so Next.js
// can proxy the request to the internal NestJS process (via next.config rewrites).
// If NEXT_PUBLIC_API_URL is explicitly set (e.g. in dev or a custom deploy) use it;
// otherwise default to the relative path which works on any host.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api/v1").trim();

// Module-level in-memory cache for GET responses.
// Survives React component mount/unmount so navigating away and back shows data instantly.
// Each entry stores { data, cachedAt } so stale entries (> 15 min old) are excluded from
// getCachedFirst() — 15 min covers Hostinger's ~10 min hibernation window so returning
// users always see cached data while the server cold-starts, rather than a blank page.
const CACHE_TTL_MS = 15 * 60 * 1000;
const _getCache = new Map<string, { data: unknown; cachedAt: number }>();

/** Return the last successful GET response for exactly `path`, or undefined if stale. */
export function getCached<T>(path: string): T | undefined {
  const entry = _getCache.get(path);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) { _getCache.delete(path); return undefined; }
  return entry.data as T;
}

/**
 * Return the first cached GET response whose key equals `pathPrefix` or starts
 * with `pathPrefix + "?"` / `pathPrefix + "/"`.
 * Use this in useState initializers instead of getCached when the page fetches
 * with query params (filters, dates) so the cache always hits on re-navigation.
 * Returns undefined for entries older than CACHE_TTL_MS.
 */
export function getCachedFirst<T>(pathPrefix: string): T | undefined {
  const direct = _getCache.get(pathPrefix);
  if (direct) {
    if (Date.now() - direct.cachedAt <= CACHE_TTL_MS) return direct.data as T;
    _getCache.delete(pathPrefix);
  }
  const now = Date.now();
  for (const [k, v] of _getCache.entries()) {
    // Only match query-param variants (e.g. /finance/expenses?startDate=...).
    // Deliberately do NOT match sub-paths (e.g. /poultry/batches/uuid) — those are
    // individual item responses and would corrupt a list page's rows state.
    if (k.startsWith(pathPrefix + "?")) {
      if (now - v.cachedAt <= CACHE_TTL_MS) return v.data as T;
      _getCache.delete(k);
    }
  }
  return undefined;
}

/** True if any non-stale cached key equals or starts with `pathPrefix` (query-param variants only). */
export function hasCached(pathPrefix: string): boolean {
  const direct = _getCache.get(pathPrefix);
  if (direct && Date.now() - direct.cachedAt <= CACHE_TTL_MS) return true;
  for (const [k, v] of _getCache.entries()) {
    if (k.startsWith(pathPrefix + "?") && Date.now() - v.cachedAt <= CACHE_TTL_MS) return true;
  }
  return false;
}

/** Invalidate a cached path (or all paths starting with a prefix when `prefix` is true). */
export function invalidateCache(pathOrPrefix: string, prefix = false): void {
  if (prefix) {
    for (const key of _getCache.keys()) {
      if (key.startsWith(pathOrPrefix)) _getCache.delete(key);
    }
  } else {
    _getCache.delete(pathOrPrefix);
  }
}

/** Clear every cached GET response (call on logout so the next user never sees stale data). */
export function clearAllCache(): void {
  _getCache.clear();
}

export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
  // Non-fatal, checkable warnings a 2xx response can still carry — e.g.
  // market-planning's createTarget flags an implausibly large computed
  // quantity (likely kg typed into a bags field) without blocking creation.
  warnings?: string[];
};

// Three distinct refresh outcomes.
// EXPORTED so auth-context shares this singleton — concurrent callers must not each fire
// their own /api/auth/refresh with the same old token (API rotates on use → second caller
// gets "token already revoked" → spurious auth:session-expired → user kicked to login).
export type RefreshResult = "ok" | "expired" | "unreachable";
let _refreshPromise: Promise<RefreshResult> | null = null;

export async function refreshSession(): Promise<RefreshResult> {
  if (_refreshPromise) return _refreshPromise;
  // Abort after 12s — without a timeout the browser holds the connection open for 30+ seconds
  // while NestJS is cold-starting on Hostinger, blocking auth-context and every apiFetch call.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  _refreshPromise = fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    signal: controller.signal,
  })
    .then((r): RefreshResult => {
      // Only treat as "ok" if we actually got JSON back — a 200+HTML startup page from
      // start.js (while webReady=false) is NOT a successful refresh.
      if (r.ok && (r.headers.get("content-type") ?? "").includes("application/json")) return "ok";
      if (r.status === 401 || r.status === 403) return "expired";
      return "unreachable"; // 503 startup page, 502 proxy error, network failure, etc.
    })
    .catch((): RefreshResult => "unreachable")  // AbortError (timeout) → unreachable
    .finally(() => { clearTimeout(timer); _refreshPromise = null; });
  return _refreshPromise;
}

// Wraps fetch with two defenses:
// 1. AbortController timeout — a hanging NestJS process (PM2 restart on Hostinger) would
//    leave fetch pending indefinitely; we abort after 12s and convert to a synthetic 504.
// 2. Startup HTML detection — start.js now returns 503 during startup, but as a safety net
//    we also catch any 200+HTML response (which used to be the bug) and return 503 so the
//    TRANSIENT_STATUSES retry logic below handles it the same way.
async function request(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  // H-WEB-2: a FormData body needs the browser to set its own multipart
  // Content-Type (with the correct boundary) — forcing application/json here
  // the way every other call needs would silently break every file upload
  // that went through this wrapper, so callers uploading files never used it
  // at all and got none of the cold-start retry/timeout handling below.
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(isFormData ? {} : { "content-type": "application/json" }),
        ...init?.headers
      }
    });

    // Safety net: if we somehow still get HTML with a 200 (defensive guard against the old
    // start.js bug or any future proxy misconfiguration), treat it as transient.
    if (res.ok && (res.headers.get("content-type") ?? "").startsWith("text/html")) {
      const body = await res.text();
      if (body.includes("Starting up") || (body.includes("refresh") && body.length < 600)) {
        return new Response(
          JSON.stringify({ message: "Service is starting up. Please wait." }),
          { status: 503, headers: { "content-type": "application/json" } }
        );
      }
      // Reconstruct for downstream HTML detection (the < check in apiFetch)
      return new Response(body, { status: res.status });
    }

    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Convert timeout to synthetic 504 so TRANSIENT_STATUSES retry handles it
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
    // text is plain or HTML
  }
  // Cloudflare challenge pages and proxy error pages are HTML — never display raw HTML as an error.
  if (text.trimStart().startsWith("<")) {
    return "API server is not reachable. Please try again shortly.";
  }
  return text;
}

function signalSessionExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth:session-expired"));
  }
}

// 502/503/504 = API temporarily unavailable (startup, crash, Hostinger proxy timeout).
// Retry up to MAX_TRANSIENT_RETRIES times with 3s gaps to ride out Hostinger cold starts.
// Hostinger cold-start observed at 15-40s; 12 retries (36s) covers the upper end.
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const MAX_TRANSIENT_RETRIES = 12;

import { authReady } from "./auth-gate";

// Shared by apiFetch (JSON) and apiFetchResponse (raw Response, e.g. SVG/blob):
// auth-gate wait, 401-refresh-and-retry, cold-start transient retry loop, and
// the post-cold-start-401 recovery. Everything below this point is specific
// to how the caller wants to consume the body.
async function resolveResponse(path: string, init?: RequestInit & { quiet?: boolean }): Promise<{ response: Response; firedUnavailable: boolean }> {
  // Block until auth-context has finished its initial session check.
  // This ensures the token refresh (if needed) is done and the fresh jokas_at cookie is
  // in the browser before the first data request fires — eliminates the concurrent-refresh
  // race where auth-context and page components both try to rotate the same refresh token.
  if (typeof window !== "undefined") {
    await authReady;
  }

  let response = await request(path, init);

  // ── 401 handling ──────────────────────────────────────────────────────────
  if (response.status === 401) {
    const refreshResult = await refreshSession();

    if (refreshResult === "ok") {
      response = await request(path, init);
    } else if (refreshResult === "expired") {
      signalSessionExpired();
      throw new Error("Session expired. Please log in again.");
    } else {
      // API unreachable during refresh — wait and try the whole flow once more
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

  // ── Transient error retry loop ────────────────────────────────────────────
  // Covers: 502/503 startup page (now correctly 503 from start.js), 504 timeout,
  // and the synthetic 503/504 responses created by request() above.
  let retries = 0;
  while (TRANSIENT_STATUSES.has(response.status) && retries < MAX_TRANSIENT_RETRIES) {
    retries++;
    await new Promise<void>(r => setTimeout(r, 3000));
    response = await request(path, init);
  }

  // Track whether api:unavailable was fired so we don't double-notify below.
  let firedUnavailable = false;
  // If we burned through all retries and the API is still unavailable, signal the shell
  // so it can show a "starting up" banner and schedule an auto-reload. This prevents the
  // page from silently showing empty data with no recovery path.
  if (TRANSIENT_STATUSES.has(response.status)) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("api:unavailable"));
      firedUnavailable = true;
    }
  }

  // ── Post-cold-start 401 recovery ─────────────────────────────────────────
  // Hostinger hibernates the NestJS process after ~10 minutes of inactivity —
  // the same window as the JWT_ACCESS_TTL. When both events coincide:
  //   1. The first request times out (504) while the server warms up.
  //   2. The initial 401 branch above is NEVER taken (status was 504, not 401).
  //   3. The transient retry loop runs, the server comes back, but now the
  //      access-token cookie has also expired → it responds 401.
  // Without this block, we fall through to the "Final response" section which
  // immediately fires signalSessionExpired() without ever trying to refresh —
  // causing a premature redirect to login ("everything vanished").
  if (response.status === 401) {
    const postRetryRefresh = await refreshSession();
    if (postRetryRefresh === "ok") {
      response = await request(path, init);
    } else if (postRetryRefresh === "expired") {
      signalSessionExpired();
      throw new Error("Session expired. Please log in again.");
    } else {
      throw new Error("API server is not reachable. Please try again shortly.");
    }
  }

  return { response, firedUnavailable };
}

export async function apiFetch<T>(path: string, init?: RequestInit & { quiet?: boolean }): Promise<T> {
  const { response, firedUnavailable } = await resolveResponse(path, init);

  // ── Final response handling ───────────────────────────────────────────────
  if (!response.ok) {
    if (response.status === 401) {
      signalSessionExpired();
    }
    const errText = await response.text();
    // For failed GET requests that aren't auth/permission/not-found errors,
    // fire api:data-error so the shell can show a "failed to load" toast.
    // Transient errors (502/503/504) are already handled by api:unavailable.
    // Mutations (POST/PATCH/DELETE) surface their errors inline — skip those.
    const isGet = (init?.method ?? "GET").toUpperCase() === "GET";
    const skipStatuses = new Set([400, 401, 403, 404, 409, 422, 429]);
    if (isGet && !firedUnavailable && !skipStatuses.has(response.status) && !init?.quiet && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("api:data-error"));
    }
    throw new Error(extractErrorMessage(errText));
  }

  const text = await response.text();
  if (!text) return {} as T;
  if (text.trimStart().startsWith("<")) {
    // Unexpected HTML reached this far (proxy misconfiguration) — don't try to parse
    throw new Error("API server is not reachable. Please try again shortly.");
  }
  const parsed = JSON.parse(text) as T;
  // Cache GET responses so pages show data immediately on re-mount (navigation back).
  if ((init?.method ?? "GET").toUpperCase() === "GET") {
    // Don't poison a valid cache with a spuriously empty response. If the server returns
    // { data: [] } but we already have non-empty cached data within TTL, keep the good cache
    // and let the next successful non-empty response refresh it.
    const freshData = (parsed as Record<string, unknown>)?.data;
    const isEmptyEnvelope = Array.isArray(freshData) && freshData.length === 0;
    if (isEmptyEnvelope) {
      const existing = _getCache.get(path);
      const existingData = (existing?.data as Record<string, unknown>)?.data;
      const hasValidCache = Array.isArray(existingData) && existingData.length > 0 && Date.now() - (existing?.cachedAt ?? 0) <= CACHE_TTL_MS;
      if (!hasValidCache) {
        _getCache.set(path, { data: parsed, cachedAt: Date.now() });
      }
    } else {
      _getCache.set(path, { data: parsed, cachedAt: Date.now() });
    }
  }
  return parsed;
}

// H-WEB-2: for endpoints that don't return JSON (e.g. the QR label SVG),
// apiFetch's JSON.parse would break. This gives the same auth-gate wait +
// cold-start retry + 401-refresh handling as apiFetch, but hands back the raw
// Response so the caller can .text()/.blob() it themselves.
export async function apiFetchResponse(path: string, init?: RequestInit & { quiet?: boolean }): Promise<Response> {
  const { response } = await resolveResponse(path, init);
  if (!response.ok) {
    if (response.status === 401) signalSessionExpired();
    throw new Error(extractErrorMessage(await response.text()));
  }
  return response;
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
