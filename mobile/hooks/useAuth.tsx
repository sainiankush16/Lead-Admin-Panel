import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, ApiClientError } from "@/services/api";
import { clearSessionToken, getSessionToken, saveSessionToken } from "@/lib/secureSession";
import type { User } from "@/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  sessionExpiredMessage: string | null;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  handleUnauthorized: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_EXPIRED = "Session expired. Please login again.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  const handleUnauthorized = useCallback(async () => {
    api.setSessionToken(null);
    await clearSessionToken();
    setUser(null);
    setStatus("unauthenticated");
    setSessionExpiredMessage(SESSION_EXPIRED);
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(handleUnauthorized);
    return () => api.setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getSessionToken();
        if (!token) {
          if (!cancelled) setStatus("unauthenticated");
          return;
        }
        api.setSessionToken(token);
        const me = await api.getMe();
        if (cancelled) return;
        if (me.authenticated && me.user) {
          setUser(me.user);
          setStatus("authenticated");
          setSessionExpiredMessage(null);
        } else {
          await handleUnauthorized();
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 401) {
          await handleUnauthorized();
        } else {
          api.setSessionToken(null);
          setStatus("unauthenticated");
          setError(err instanceof Error ? err.message : "Unable to restore session.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleUnauthorized]);

  const login = useCallback(async (loginId: string, password: string) => {
    setError(null);
    setSessionExpiredMessage(null);
    try {
      const result = await api.login(loginId, password);
      await saveSessionToken(result.sessionToken, result.expiresAt);
      api.setSessionToken(result.sessionToken);
      setUser(result.user);
      setStatus("authenticated");
    } catch (err) {
      api.setSessionToken(null);
      await clearSessionToken();
      setStatus("unauthenticated");
      if (err instanceof ApiClientError) {
        setError(err.message || "Invalid login ID or password.");
      } else if (err instanceof TypeError) {
        setError("Network error. Check your connection and API URL.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed.");
      }
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Always clear local credentials even if network logout fails.
    } finally {
      api.setSessionToken(null);
      await clearSessionToken();
      setUser(null);
      setStatus("unauthenticated");
      setSessionExpiredMessage(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      sessionExpiredMessage,
      login,
      logout,
      clearError: () => setError(null),
      handleUnauthorized
    }),
    [status, user, error, sessionExpiredMessage, login, logout, handleUnauthorized]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
