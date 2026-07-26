import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  type AuthUser,
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

  const restoreSession = useCallback(async () => {
    const token = await getAccessToken();
    // SecureStore has been read — unblock all pending apiFetch() calls. Any
    // screen that mounted before this point was waiting on the auth-ready gate.
    markAuthReady();
    if (!token) { setLoading(false); return; }
    try {
      const res = await apiFetch<{ data: AuthUser }>("/auth/me");
      setUser(res.data);
    } catch {
      await clearSession();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { restoreSession(); }, [restoreSession]);

  // Proactive token refresh — prevents a visible pause after 15-min idle.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      const ok = await refreshSession();
      if (!ok) setUser(null); // refresh token revoked → force re-login
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
