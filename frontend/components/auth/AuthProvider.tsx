"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, hasSessionHint } from "@/lib/api";
import type { User } from "@/lib/types";

type AuthState = {
  user: User | null;
  loading: boolean;
  reload: () => Promise<void>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setUser(await api<User>("/users/me"));
    } catch (e) {
      if (!(e instanceof ApiError)) console.warn("No se pudo comprobar la sesión");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Comprobación inicial de sesión. Sin cookie de sesión (visitante anónimo) NO se llama al servidor:
    // así no hay 401 inútiles ni ruido en la consola.
    let live = true;
    const check: Promise<User | null> = hasSessionHint() ? api<User>("/users/me") : Promise.resolve(null);
    check
      .then((u) => live && setUser(u))
      .catch(() => live && setUser(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, reload, setUser, logout }), [user, loading, reload, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return v;
}

export function can(user: User | null, permission: string): boolean {
  return !!user && user.permissions.includes(permission);
}
