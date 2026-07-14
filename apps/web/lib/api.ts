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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await request(path, init);

  if (response.status === 401 && (await refreshSession())) {
    response = await request(path, init);
  }

  if (!response.ok) {
    throw new Error(extractErrorMessage(await response.text()));
  }

  const text = await response.text();
  if (!text) return {} as T;
  if (text.trimStart().startsWith("<")) {
    throw new Error("API server is not reachable. Please try again in a moment.");
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
