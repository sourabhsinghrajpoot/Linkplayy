import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // null=checking, false=guest, obj=user
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    // If returning from Emergent OAuth callback, let AuthCallback handle it first.
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    try {
      const u = await api.me();
      setUser(u);
    } catch (e) {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const u = await api.login({ email, password });
    setUser(u);
    return u;
  };

  const register = async (email, password, name) => {
    const u = await api.register({ email, password, name });
    setUser(u);
    return u;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (_) {
      /* ignore */
    }
    setUser(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refresh, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
