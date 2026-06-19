import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type AuthUser, clearSession, getAccessToken, login as apiLogin, logout as apiLogout } from "../api/client";
import { apiFetch } from "../api/client";

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
  logout: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const restoreSession = useCallback(async () => {
    const token = await getAccessToken();
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

  const login = useCallback(async (email: string, password: string) => {
    const authUser = await apiLogin(email, password);
    setUser(authUser);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
