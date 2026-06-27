const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api/v1").trim();

export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

// Tokens are now stored in HttpOnly cookies — these are stubs kept for call-site compatibility.
// The browser sends jokas_at / jokas_rt cookies automatically on every credentialed request.
export function getAccessToken(): string | null {
  return null;
}
export function getRefreshToken(): string | null {
  return null;
}
export function setSession(_accessToken: string, _refreshToken: string): void {}
export function clearSession(): void {}

async function refreshSession(): Promise<boolean> {
  // Must go through the Next.js proxy so the refreshed cookie is set on the
  // same origin (3000) and remains visible to the middleware.
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" }
  });
  return response.ok;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await request(path, init);

  if (response.status === 401 && (await refreshSession())) {
    response = await request(path, init);
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

export async function downloadReport(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
