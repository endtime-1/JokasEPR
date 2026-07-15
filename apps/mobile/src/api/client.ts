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

async function refreshSession(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal
    });
    clearTimeout(tid);
    if (!response.ok) { await clearSession(); return false; }
    const body = await response.json();
    await setSession(body.data.accessToken, body.data.refreshToken);
    return true;
  } catch {
    clearTimeout(tid);
    return false;
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const initWithSignal: RequestInit = { ...init, signal: controller.signal };

  let response: Response;
  try {
    response = await request(path, initWithSignal);
  } catch (e) {
    clearTimeout(tid);
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError(0, "Request timed out — check your connection and try again.");
    }
    throw new ApiError(0, "Network error — check your connection and try again.");
  }

  if (response.status === 401 && (await refreshSession())) {
    try {
      response = await request(path, initWithSignal);
    } catch (e) {
      clearTimeout(tid);
      if (e instanceof Error && e.name === "AbortError") {
        throw new ApiError(0, "Request timed out — check your connection and try again.");
      }
      throw new ApiError(0, "Network error — check your connection and try again.");
    }
  }

  clearTimeout(tid);

  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await response.json();
      if (typeof body?.message === "string" && body.message.length < 200) {
        message = body.message;
      }
    } catch {
      // keep generic message — never expose raw server text
    }
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  const res = await apiFetch<{ data: { accessToken: string; refreshToken: string; user: AuthUser } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
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
