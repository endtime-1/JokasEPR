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
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

const REQUEST_TIMEOUT_MS = 15_000;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const TRANSIENT_RETRY_DELAY_MS = 3_000;
const TRANSIENT_MAX_RETRIES = 3;

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
let _refreshPromise: Promise<boolean> | null = null;

async function _doRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
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
    if (!response.ok) { await clearSession(); return false; }
    const rawText = await response.text();
    if (!rawText) { return false; }
    const body = JSON.parse(rawText) as { data: { accessToken: string; refreshToken: string } };
    await setSession(body.data.accessToken, body.data.refreshToken);
    return true;
  } catch {
    clearTimeout(tid);
    return false;
  }
}

export async function refreshSession(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
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

  if (response.status === 401 && (await refreshSession())) {
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
  if (typeof res.data.accessToken !== "string" || typeof res.data.refreshToken !== "string") {
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
