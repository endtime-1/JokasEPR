"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiEnvelope, refreshSession } from "../lib/api";

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
    // 35s covers up to 3 attempts × 3s wait between them plus API response time
    const timeout = setTimeout(() => setReady(true), 35000);

    async function loadProfile() {
      const MAX_ATTEMPTS = 3;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // --- Fetch profile ---
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

        // --- Handle 401: access token expired, try to refresh ---
        if (res.status === 401) {
          // Share the same singleton as apiFetch — prevents concurrent races where both
          // fire independent refresh requests with the same old token, causing the second
          // to receive a "token already revoked" 401 and kicking the user to login.
          const refreshResult = await refreshSession();

          if (refreshResult === "ok") {
            // New access token is now in the cookie — retry /me
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
            // Refresh token is genuinely invalid — session is over
            router.replace("/login");
            return;
          } else {
            // API unreachable (502 / network error) — give it time to warm up and retry
            if (attempt < MAX_ATTEMPTS) {
              await new Promise<void>(r => setTimeout(r, 3000 * attempt));
              continue;
            }
            // All retries exhausted: API is down, but don't redirect to login —
            // the user's session may be valid once the API recovers
            return;
          }
        }

        // --- Handle other non-OK responses ---
        if (!res.ok) {
          // 5xx or proxy error — retry if possible, don't redirect
          if (attempt < MAX_ATTEMPTS) {
            await new Promise<void>(r => setTimeout(r, 3000 * attempt));
            continue;
          }
          return;
        }

        // --- Success ---
        const json = (await res.json()) as ApiEnvelope<Profile>;
        setProfile(json.data);
        return;
      }
    }

    loadProfile()
      .catch(() => undefined)
      .finally(() => { clearTimeout(timeout); setReady(true); });
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
