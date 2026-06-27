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
    apiFetch<ApiEnvelope<Profile>>("/auth/me")
      .then((res) => setProfile(res.data))
      .catch(() => router.replace("/login"))
      .finally(() => setReady(true));
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
