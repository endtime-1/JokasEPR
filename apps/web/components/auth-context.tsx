"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiEnvelope, apiFetch } from "../lib/api";

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    async function loadProfile() {
      let res = await fetch("/api/auth/me", { credentials: "include", signal: controller.signal });

      if (res.status === 401) {
        // Access token expired — try to refresh before giving up
        const refreshRes = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
        }).catch(() => null);

        if (refreshRes?.ok) {
          res = await fetch("/api/auth/me", { credentials: "include" });
        } else {
          // Refresh token also invalid — genuine session expiry
          router.replace("/login");
          return;
        }
      }

      if (!res.ok) {
        // 5xx / API unreachable — don't kick to login; API may be slow on Hostinger
        return;
      }

      const json = (await res.json()) as ApiEnvelope<Profile>;
      setProfile(json.data);
    }

    loadProfile()
      .catch(() => undefined) // AbortError (timeout) or network failure — stay on page
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
