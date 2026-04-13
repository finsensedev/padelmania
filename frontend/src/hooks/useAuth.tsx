// src/hooks/useAuth.tsx
import { useState, useEffect, createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import authServiceInstance, { type User } from "src/services/authService";
import type { UserRole } from "../types/user.types";
import store from "src/redux/store";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      await authServiceInstance.refreshAccessToken();
      const state = store.getState();
      setUser(state.userState.user ?? null);
    } catch (error) {
      console.error("Auth check failed:", error);
      authServiceInstance.clearAllAuthData();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authServiceInstance.login({
      email,
      password,
    });

    const roleRedirects: Partial<Record<UserRole, string>> = {
      SUPER_ADMIN: "/superadmin",
      ADMIN: "/admin",
      MANAGER: "/manager",
      FINANCE_OFFICER: "/finance-officer",
      BOOKING_OFFICER: "/booking-officer",
      CUSTOMER: "/customer",
    };

    setUser(response.data.user);

    const target =
      roleRedirects[response.data.user.role as UserRole] || "/customer";
    navigate(target);
  };

  const logout = async () => {
    try {
      await authServiceInstance.logout();
    } finally {
      setUser(null);
      navigate("/login");
    }
  };

  const refreshToken = async () => {
    try {
      await authServiceInstance.refreshAccessToken();
      const state = store.getState();
      setUser(state.userState.user ?? null);
    } catch (error) {
      console.error("Token refresh failed:", error);
      await logout();
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, refreshToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
