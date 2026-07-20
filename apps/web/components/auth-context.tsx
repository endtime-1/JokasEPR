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

    async function loadProfile() {
      const MAX_ATTEMPTS = 3;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res: Response;
        try {
          res = await fetch("/api/auth/me", { credentials: "include" });
        } catch {
          // Network error — retry if attempts remain
          if (attempt < MAX_ATTEMPTS) {
            await new Promise<void>(r => setTimeout(r, 3000 * attempt));
            continue;
          }
          return;
        }

        if (res.status === 401) {
          // Access token expired — use the shared singleton so this refresh call and any
          // concurrent apiFetch() calls share one HTTP request and don't race on the token.
          const refreshResult = await refreshSession();

          if (refreshResult === "ok") {
            try {
              res = await fetch("/api/auth/me", { credentials: "include" });
            } catch {
              if (attempt < MAX_ATTEMPTS) {
                await new Promise<void>(r => setTimeout(r, 3000 * attempt));
                continue;
              }
              return;
            }
          } else if (refreshResult === "expired") {
            // Refresh token genuinely invalid — session is over, go to login
            router.replace("/login");
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
