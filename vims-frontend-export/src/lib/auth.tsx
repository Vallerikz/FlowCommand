import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ApiError, SESSION_EXPIRED_EVENT, apiRequest, clearSession, getToken } from "./api";
import { TOKEN_KEY, USER_KEY } from "./config";

export type VimsUser = {
  name?: string;
  badge_id?: string;
  email?: string;
  division?: string;
  clearance?: string;
  role?: string;
  [key: string]: unknown;
};

type LoginPayload = {
  role: "law" | "citizen";
  badge_id?: string;
  email?: string;
  division?: string;
  password?: string;
  otp?: string;
};

type AuthState = {
  token: string | null;
  user: VimsUser | null;
  ready: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<VimsUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function readStoredUser(): VimsUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VimsUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<VimsUser | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate after mount so SSR and the first client render agree.
  useEffect(() => {
    const stored = getToken();
    setToken(stored);
    setUser(readStoredUser());
    setReady(true);
    if (!stored) return;
    // Confirm with the backend; only a hard 401 clears the session.
    apiRequest<{ success?: boolean; user?: VimsUser }>("/api/auth/validate-token", {
      method: "POST",
    })
      .then((res) => {
        if (res?.user) {
          setUser(res.user);
          window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          setToken(null);
          setUser(null);
        }
      });
  }, []);

  // Any request that comes back 401 clears storage; drop the in-memory session
  // too so the route guard sends the user back to the login page immediately.
  useEffect(() => {
    const onExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const res = await apiRequest<{ success?: boolean; token?: string; user?: VimsUser; message?: string }>(
      "/api/auth/login",
      { method: "POST", body: payload, auth: false },
    );
    if (!res?.token) {
      throw new ApiError(res?.message || "The server did not return a session.", 401);
    }
    window.localStorage.setItem(TOKEN_KEY, res.token);
    const nextUser = res.user ?? null;
    if (nextUser) window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(res.token);
    setUser(nextUser);
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      /* signing out locally matters more than the server acknowledging it */
    }
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token, user, ready, isAuthenticated: Boolean(token), login, logout }),
    [token, user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
