/* eslint-disable react-refresh/only-export-components */
import axios from "axios";
import store from "src/redux/store";
import type { RootState } from "src/redux/store";
import { loadUser, logout as logoutAction } from "../redux/slicers/userSlice";
import { setSession, clearSession } from "../redux/slicers/sessionSlice";
import { stripAuthFromPersistedState } from "src/utils/persist";

axios.defaults.withCredentials = true;

const API_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface User {
  id: string;
  email?: string; // Optional - only present in /api/auth/session response for security
  phone?: string | null; // Optional - only present in /api/auth/session response for security
  firstName: string;
  lastName: string;
  avatar?: string | null;
  role: string;
  isActive?: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLogin: string | null;
  createdAt?: string;
  updatedAt?: string;
  loyaltyPoints?: number;
  staff?: unknown | null;
  membershipCard?: unknown | null;
}

export interface LoginData {
  user: User;
  expiresIn?: number;
}

export interface LoginResponse {
  status: "success" | "error";
  message: string;
  data: LoginData;
}

interface SessionResponse {
  status: "success" | "error";
  message: string;
  data?: {
    user: User;
  };
}

class SimplifiedAuthService {
  private static instance: SimplifiedAuthService;
  private refreshTimer: NodeJS.Timeout | null = null;
  private bootstrapPromise: Promise<void> | null = null;

  private constructor() {
    this.bootstrapPromise = this.bootstrapSession();
  }

  public static getInstance(): SimplifiedAuthService {
    if (!SimplifiedAuthService.instance) {
      SimplifiedAuthService.instance = new SimplifiedAuthService();
    }
    return SimplifiedAuthService.instance;
  }

  private async bootstrapSession() {
    try {
      await this.refreshAccessToken();
    } catch {
      this.clearAllAuthData();
    } finally {
      this.bootstrapPromise = null;
    }
  }

  public async waitForBootstrap(): Promise<void> {
    if (this.bootstrapPromise) {
      await this.bootstrapPromise;
    }
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      // Use the regular axios for login (no token needed)
      const response = await axios.post<LoginResponse>(
        `${API_URL}/api/auth/login`,
        credentials,
        { withCredentials: true }
      );

      const { user, expiresIn } = response.data.data;
      const ttl = typeof expiresIn === "number" ? expiresIn : undefined;
      store.dispatch(setSession(ttl ? { expiresIn: ttl } : undefined));

      this.scheduleSessionRefresh(ttl);

      const sessionUser = await this.fetchCurrentUser();
      const resolvedUser = sessionUser ?? user;

      if (!sessionUser) {
        store.dispatch(loadUser({ user: resolvedUser }));
      }

      return {
        ...response.data,
        data: {
          ...response.data.data,
          user: resolvedUser,
        },
      };
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  }

  isAuthenticated(): boolean {
    const state: RootState = store.getState();
    const sessionState = state.userSession;
    if (!sessionState?.sessionActive) {
      return false;
    }

    if (sessionState.expiresAt && sessionState.expiresAt <= Date.now()) {
      return false;
    }

    return Boolean(state.userState?.user);
  }

  async logout(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    try {
      await axios.post(
        `${API_URL}/api/auth/logout`,
        {},
        { withCredentials: true }
      );
    } catch (error) {
      console.warn("Logout request failed", error);
    } finally {
      this.clearAllAuthData();
    }
  }

  async refreshAccessToken(): Promise<void> {
    try {
      const response = await axios.post<LoginResponse>(
        `${API_URL}/api/auth/refresh`,
        {},
        { withCredentials: true }
      );

      const { expiresIn } = response.data.data;
      const ttl = typeof expiresIn === "number" ? expiresIn : undefined;

      store.dispatch(setSession(ttl ? { expiresIn: ttl } : undefined));

      // Always fetch current user to get full profile including PII (email, phone)
      // The refresh response only contains minimal user data for security
      const resolvedUser = await this.fetchCurrentUser();

      if (resolvedUser) {
        store.dispatch(loadUser({ user: resolvedUser }));
      }

      this.scheduleSessionRefresh(ttl);
    } catch (error) {
      console.error("Token refresh error:", error);
      this.clearAllAuthData();
      throw error;
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
      await axios.post(`${API_URL}/api/auth/forgot-password`, { email });
    } catch (error) {
      console.error("Password reset request error:", error);
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        token,
        newPassword,
      });
    } catch (error) {
      console.error("Password reset error:", error);
      throw error;
    }
  }

  async register(data: RegisterData): Promise<{ user: User }> {
    try {
      const response = await axios.post<{
        status: "success";
        message: string;
        data: { user: User };
      }>(`${API_URL}/api/auth/register`, data);
      return response.data.data;
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  }

  async resendVerification(email: string): Promise<void> {
    try {
      await axios.post(`${API_URL}/api/auth/resend-verification`, { email });
    } catch (error) {
      console.error("Resend verification error:", error);
      throw error;
    }
  }

  async verifyTwoFA(code: string): Promise<void> {
    try {
      const response = await axios.post(`${API_URL}/api/auth/2fa/verify`, {
        code,
      });
      return response.data;
    } catch (error) {
      console.error("2FA verification error:", error);
      throw error;
    }
  }

  clearAllAuthData(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    store.dispatch(clearSession());
    store.dispatch(logoutAction());

    stripAuthFromPersistedState();
  }
  private async fetchCurrentUser(): Promise<User | null> {
    try {
      const response = await axios.get<SessionResponse>(
        `${API_URL}/api/auth/session`,
        {
          withCredentials: true,
        }
      );

      const sessionUser = response.data?.data?.user;

      if (sessionUser) {
        store.dispatch(loadUser({ user: sessionUser }));
        return sessionUser;
      }
    } catch (error) {
      console.warn("Failed to load session details", error);
    }

    return null;
  }

  private scheduleSessionRefresh(expiresIn?: number) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const ttl =
      typeof expiresIn === "number"
        ? expiresIn
        : (() => {
            const state: RootState = store.getState();
            if (!state.userSession?.expiresAt) {
              return undefined;
            }
            const remaining = (state.userSession.expiresAt - Date.now()) / 1000;
            return remaining > 0 ? remaining : undefined;
          })();

    if (ttl === undefined || ttl <= 0) {
      return;
    }

    const refreshDelayMs = ttl * 1000;
    const refreshBufferMs = 120_000; // refresh 2 minutes before expiry
    const scheduleIn = Math.max(5_000, refreshDelayMs - refreshBufferMs);

    this.refreshTimer = setTimeout(() => {
      this.refreshAccessToken().catch(() => {
        this.clearAllAuthData();
      });
    }, scheduleIn);
  }
}

export { SimplifiedAuthService as AuthService };
const authServiceInstance = SimplifiedAuthService.getInstance();
export default authServiceInstance;

// Keep the original authService object for backward compatibility
export const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return authServiceInstance.login(credentials);
  },

  async refreshToken(): Promise<void> {
    return authServiceInstance.refreshAccessToken();
  },

  logout() {
    return authServiceInstance.logout();
  },

  async requestPasswordReset(email: string): Promise<void> {
    return authServiceInstance.requestPasswordReset(email);
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    return authServiceInstance.resetPassword(token, newPassword);
  },

  async register(data: RegisterData): Promise<{ user: User }> {
    return authServiceInstance.register(data);
  },

  async resendVerification(email: string): Promise<void> {
    return authServiceInstance.resendVerification(email);
  },

  async verifyTwoFA(code: string): Promise<void> {
    return authServiceInstance.verifyTwoFA(code);
  },
};
