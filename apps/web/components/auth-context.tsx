"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiEnvelope, refreshSession } from "../lib/api";
import { signalAuthReady } from "../lib/auth-gate";

type Profile = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  hasGlobalAccess: boolean;
};

type AuthContextValue = {
  profile: Profile | null;
  ready: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  profile: null,
  ready: false,
  signOut: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const signOutRef = useRef(false);

  useEffect(() => {
    // 35s covers up to 3 attempts × (3s + 6s) wait between them plus API response time.
    // signalAuthReady is called in finally — this timeout is a last-resort UI unblock only.
    const timeout = setTimeout(() => { setReady(true); signalAuthReady(); }, 35000);

    // 12s AbortController — prevents /api/auth/me from hanging indefinitely while
    // Hostinger is cold-starting, which would cause the 35s safety valve to fire
    // and render the UI with profile=null (blank navigation).
    async function fetchMe(signal: AbortSignal): Promise<Response | null> {
      try {
        return await fetch("/api/auth/me", { credentials: "include", signal });
      } catch {
        return null;
      }
    }

    async function loadProfile() {
      const MAX_ATTEMPTS = 3;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 12000);
        const res0 = await fetchMe(controller.signal);
        clearTimeout(tid);

        if (!res0) {
          if (attempt < MAX_ATTEMPTS) {
            await new Promise<void>(r => setTimeout(r, 3000 * attempt));
            continue;
          }
          return;
        }

        let res: Response = res0;

        if (res.status === 401) {
          // Access token expired — use the shared singleton so this refresh call and any
          // concurrent apiFetch() calls share one HTTP request and don't race on the token.
          const refreshResult = await refreshSession();

          if (refreshResult === "ok") {
            const c2 = new AbortController();
            const t2 = setTimeout(() => c2.abort(), 12000);
            const res2 = await fetchMe(c2.signal);
            clearTimeout(t2);
            if (!res2) {
              if (attempt < MAX_ATTEMPTS) {
                await new Promise<void>(r => setTimeout(r, 3000 * attempt));
                continue;
              }
              return;
            }
            res = res2;
          } else if (refreshResult === "expired") {
            // Refresh token genuinely invalid — session is over, go to login.
            // Guard: skip the redirect when already on /login so we don't reset
            // the form (and avoid a potential re-render loop on the same route).
            if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
              router.replace("/login");
            }
            return;
          } else {
            // API unreachable (502 / network error) — give it time to warm up and retry
            if (attempt < MAX_ATTEMPTS) {
              await new Promise<void>(r => setTimeout(r, 3000 * attempt));
              continue;
            }
            // All retries exhausted: API is down but don't redirect to login —
            // the user's session may be valid once the API recovers
            return;
          }
        }

        if (!res.ok) {
          // 5xx or proxy error — retry if possible
          if (attempt < MAX_ATTEMPTS) {
            await new Promise<void>(r => setTimeout(r, 3000 * attempt));
            continue;
          }
          return;
        }

        let json: ApiEnvelope<Profile>;
        try {
          json = (await res.json()) as ApiEnvelope<Profile>;
        } catch {
          // Response body isn't valid JSON (e.g. a startup HTML page that slipped through).
          // Treat as transient and retry if attempts remain.
          if (attempt < MAX_ATTEMPTS) {
            await new Promise<void>(r => setTimeout(r, 3000 * attempt));
            continue;
          }
          return;
        }
        setProfile(json.data);
        return;
      }
    }

    loadProfile()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timeout);
        setReady(true);
        // Signal the auth gate so apiFetch() calls that were queued during the session
        // check are released. They now run with the fresh access token already in place.
        signalAuthReady();
      });
  }, [router]);

  // Proactive token refresh every 8 minutes — keeps the access token alive before
  // the JWT_ACCESS_TTL (default 15m) and keeps the Hostinger NestJS process warm so
  // the server never hibernates long enough to cause a cold-start at the same moment
  // the token expires (which was the root cause of "everything vanished after 10 min").
  useEffect(() => {
    const REFRESH_INTERVAL_MS = 8 * 60 * 1000; // 8 minutes
    const id = setInterval(async () => {
      const result = await refreshSession();
      if (result === "expired") {
        router.replace("/login");
      }
      // "unreachable" is fine — the reactive 401 handling in apiFetch will catch it
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  async function signOut() {
    if (signOutRef.current) return;
    signOutRef.current = true;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ profile, ready, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
