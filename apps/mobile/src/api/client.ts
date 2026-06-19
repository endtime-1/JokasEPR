import * as SecureStore from "expo-secure-store";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4001/api/v1";

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

async function refreshSession(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  if (!response.ok) { await clearSession(); return false; }
  const body = await response.json();
  await setSession(body.data.accessToken, body.data.refreshToken);
  return true;
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
  let response = await request(path, init);
  if (response.status === 401 && (await refreshSession())) {
    response = await request(path, init);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "Request failed");
    throw new ApiError(response.status, text);
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
