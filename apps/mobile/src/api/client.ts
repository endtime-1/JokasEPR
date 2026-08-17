import * as SecureStore from "expo-secure-store";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://jokasfarms.com/api/v1";

const ACCESS_KEY = "jokas.accessToken";
const REFRESH_KEY = "jokas.refreshToken";

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function setSession(accessToken: string, refreshToken: string) {
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new ApiError(0, "Sign-in failed — server returned an invalid session. Please try again.");
  }
  try {
    await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  } catch {
    throw new ApiError(0, "Sign-in failed — could not save session securely. Restart the app and try again.");
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

const REQUEST_TIMEOUT_MS = 15_000;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const TRANSIENT_RETRY_DELAY_MS = 3_000;
// Hostinger cold-start observed at 15-40s (apps/web/lib/api.ts uses the same
// 12x/3s = 36s budget for the same reason). This used to be 3 retries (9s) —
// well short of the observed window, so a cold start routinely outlasted
// mobile's entire retry budget while web's covered it.
const TRANSIENT_MAX_RETRIES = 12;

// ── Auth-ready gate ───────────────────────────────────────────────────────────
// Blocks all apiFetch() calls until AuthContext finishes reading SecureStore on
// cold launch. Without this, screens mounting during app start race with session
// restore and each fire their own 401 → refresh cycle.
let _authReadyResolve: (() => void) | null = null;
const _authReady: Promise<void> = new Promise<void>((resolve) => {
  _authReadyResolve = resolve;
});
export function markAuthReady() {
  _authReadyResolve?.();
}

// ── Singleton refresh ─────────────────────────────────────────────────────────
// Multiple concurrent 401s share one /auth/refresh round-trip. Without this the
// API's refresh-token rotation means callers 2+ get "token already revoked" and
// incorrectly clear the session, forcing an unnecessary re-login.

// Mobile parity audit (2026-08-17): a plain boolean collapsed three very
// different outcomes into one "false" — the server explicitly rejecting the
// refresh token (401/403, genuinely revoked/expired), and a network
// timeout/5xx/malformed-response that says nothing about the token's
// validity at all. AuthContext's proactive refresh treated all three as
// "revoked" and force-logged the user out — so a brief connectivity blip or
// a Hostinger cold-start 502 during the 12-minute proactive refresh tick
// logged an otherwise-fine session out. Only an explicit rejection from the
// server should ever force a logout.
export type RefreshOutcome = "refreshed" | "rejected" | "unreachable";

async function _doRefresh(): Promise<RefreshOutcome> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return "rejected";
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-type": "mobile" },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
    clearTimeout(tid);
    if (response.status === 401 || response.status === 403) { await clearSession(); return "rejected"; }
    if (!response.ok) return "unreachable";
    const rawText = await response.text();
    if (!rawText) { return "unreachable"; }
    const body = JSON.parse(rawText) as { data: { accessToken: string; refreshToken: string } };
    if (typeof body?.data?.accessToken !== "string" || typeof body?.data?.refreshToken !== "string") {
      return "unreachable";
    }
    await setSession(body.data.accessToken, body.data.refreshToken);
    return "refreshed";
  } catch {
    clearTimeout(tid);
    return "unreachable";
  }
}

let _refreshOutcomePromise: Promise<RefreshOutcome> | null = null;

export async function refreshSession(): Promise<RefreshOutcome> {
  if (_refreshOutcomePromise) return _refreshOutcomePromise;
  _refreshOutcomePromise = _doRefresh().finally(() => { _refreshOutcomePromise = null; });
  return _refreshOutcomePromise;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-client-type": "mobile",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Block until session restore from SecureStore is complete (cold-launch gate).
  await _authReady;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  function makeSignaledInit(i?: RequestInit): RequestInit {
    return { ...i, signal: controller.signal };
  }

  let response: Response;
  try {
    response = await request(path, makeSignaledInit(init));
  } catch (e) {
    clearTimeout(tid);
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError(0, "Request timed out — check your connection and try again.");
    }
    throw new ApiError(0, "Network error — check your connection and try again.");
  }

  if (response.status === 401 && (await refreshSession()) === "refreshed") {
    // Refresh succeeded — build a FRESH controller for the retry so a timer that
    // fired during the (potentially slow) refresh cycle doesn't immediately abort it.
    const retryController = new AbortController();
    const retryTid = setTimeout(() => retryController.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await request(path, { ...init, signal: retryController.signal });
    } catch (e) {
      clearTimeout(tid);
      clearTimeout(retryTid);
      if (e instanceof Error && e.name === "AbortError") {
        throw new ApiError(0, "Request timed out — check your connection and try again.");
      }
      throw new ApiError(0, "Network error — check your connection and try again.");
    }
    clearTimeout(retryTid);
  }

  // Retry on transient Hostinger Passenger cold-start errors (502/503/504).
  let retries = 0;
  while (TRANSIENT_STATUSES.has(response.status) && retries < TRANSIENT_MAX_RETRIES) {
    retries++;
    await delay(TRANSIENT_RETRY_DELAY_MS);
    try {
      const rc = new AbortController();
      const rt = setTimeout(() => rc.abort(), REQUEST_TIMEOUT_MS);
      response = await request(path, { ...init, signal: rc.signal });
      clearTimeout(rt);
    } catch {
      break;
    }
  }

  // Hostinger hibernates the API process after ~10 min idle — the same
  // window as the access-token TTL. When both coincide: the initial request
  // times out (502/503/504, not 401) so the 401-refresh block above is never
  // taken; the transient-retry loop above runs and the server comes back,
  // but the access token has now also expired, so the first real response
  // is 401. Without this check that 401 falls straight through to the
  // "!response.ok" branch below with no refresh attempt — the mobile
  // equivalent of apps/web/lib/api.ts's "everything vanished" bug it already
  // guards against at lines 248-268.
  if (response.status === 401 && (await refreshSession()) === "refreshed") {
    const postRetryController = new AbortController();
    const postRetryTid = setTimeout(() => postRetryController.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await request(path, { ...init, signal: postRetryController.signal });
    } catch (e) {
      clearTimeout(tid);
      clearTimeout(postRetryTid);
      if (e instanceof Error && e.name === "AbortError") {
        throw new ApiError(0, "Request timed out — check your connection and try again.");
      }
      throw new ApiError(0, "Network error — check your connection and try again.");
    }
    clearTimeout(postRetryTid);
  }

  clearTimeout(tid);

  // If the abort fired at the exact moment response headers arrived the body
  // stream is already cancelled — treat it as a timeout instead of leaking a
  // raw SyntaxError ("unexpected end of JSON input") to the user.
  if (controller.signal.aborted) {
    throw new ApiError(0, "Request timed out — check your connection and try again.");
  }

  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const errText = await response.text();
      if (errText) {
        const body = JSON.parse(errText) as { message?: unknown };
        if (typeof body?.message === "string" && body.message.length < 200) {
          message = body.message;
        }
      }
    } catch {
      // keep generic message — non-JSON or empty error body
    }
    throw new ApiError(response.status, message);
  }

  // Use text() + JSON.parse() so an empty or malformed body becomes a clean
  // ApiError rather than a raw SyntaxError surfacing to the user.
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiError(0, "Network error — check your connection and try again.");
  }
  if (!text) {
    throw new ApiError(0, "Network error — check your connection and try again.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(0, "Network error — check your connection and try again.");
  }
}

export async function login(email: string, password: string) {
  const res = await apiFetch<{ data: { accessToken: string; refreshToken: string; user: AuthUser } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res?.data || typeof res.data.accessToken !== "string" || typeof res.data.refreshToken !== "string") {
    throw new ApiError(0, "Sign-in failed — server did not return a session. Please try again.");
  }
  await setSession(res.data.accessToken, res.data.refreshToken);
  return res.data.user;
}

export async function logout() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }).catch(() => undefined);
  }
  await clearSession();
}

export type AuthUser = {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
  farmIds: string[];
  warehouseIds: string[];
  productionSiteIds: string[];
  hasGlobalAccess: boolean;
};
