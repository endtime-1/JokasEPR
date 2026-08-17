import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  type AuthUser,
  ApiError,
  clearSession,
  getAccessToken,
  login as apiLogin,
  logout as apiLogout,
  markAuthReady,
  refreshSession,
} from "../api/client";
import { apiFetch } from "../api/client";
import { clearLookupCache } from "../db/database";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

// Proactive refresh fires at 12 min — well inside the 15-min access token TTL.
// Prevents a visible pause for users who leave the app idle and then resume.
const PROACTIVE_REFRESH_INTERVAL_MS = 12 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const RESTORE_RETRY_DELAY_MS = 3_000;
  const RESTORE_MAX_ATTEMPTS = 3;
  function wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

  const restoreSession = useCallback(async () => {
    const token = await getAccessToken();
    markAuthReady();
    if (!token) { setLoading(false); return; }
    for (let attempt = 0; attempt < RESTORE_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await apiFetch<{ data: AuthUser }>("/auth/me");
        setUser(res.data);
        setLoading(false);
        return;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) { await clearSession(); break; }
        if (attempt < RESTORE_MAX_ATTEMPTS - 1) await wait(RESTORE_RETRY_DELAY_MS);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { restoreSession(); }, [restoreSession]);

  // Proactive token refresh — prevents a visible pause after 15-min idle.
  // Mobile parity audit (2026-08-17): only an explicit "rejected" (the
  // server actually invalidated the refresh token) should force a logout —
  // "unreachable" (network blip, Hostinger cold-start 5xx, timeout) says
  // nothing about whether the session is still good, and used to force the
  // same logout, kicking users out over a brief connectivity hiccup. On
  // "unreachable" this just skips the tick; the next interval retries, and
  // any real API call in between still goes through apiFetch's own
  // reactive-refresh-on-401 path.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      const outcome = await refreshSession();
      if (outcome === "rejected") setUser(null);
    }, PROACTIVE_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const authUser = await apiLogin(email, password);
    setUser(authUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // API call failed — still clear local session
      await clearSession();
    } finally {
      // Clear the SQLite lookup cache so a subsequent login with a different
      // account doesn't see stale data from the previous session.
      await clearLookupCache().catch(() => undefined);
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useHasGlobalAccess() {
  return useContext(AuthContext).user?.hasGlobalAccess ?? false;
}
