/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  User,
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
  UserResponse,
  UserDetailsResponse,
  BulkUpdateInput,
  BulkUpdateResult,
  BulkDeleteResult,
  ImpersonationToken,
  ExportFormat,
  ImportResult,
  UserStats,
  ActivityLog,
  ActivityParams,
  SearchOptions,
  GetUsersParams,
} from "../types/user.types";
import api, { CancelToken, isCancel } from "src/utils/api";

class UserService {
  private cancelTokenSource = CancelToken.source();

  // ==================== CRUD Operations ====================

  async getUsers(params: GetUsersParams): Promise<UserResponse> {
    try {
      const { data } = await api.get<UserResponse>("/users", {
        params: this.cleanParams(params),
        cancelToken: this.cancelTokenSource.token,
      });

      return data;
    } catch (error) {
      if (!isCancel(error)) {
        console.error("Error fetching users:", error);
      }
      throw error;
    }
  }

  async getUser(id: string): Promise<User> {
    try {
      const response = await api.get<User>(`/users/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching user ${id}:`, error);
      throw error;
    }
  }

  // Fallback to /users/:id since /users/:id/details isn't available server-side
  async getUserDetails(id: string): Promise<UserDetailsResponse> {
    try {
      const response = await api.get<UserDetailsResponse>(
        `/users/${id}/details`
      );
      return response.data;
    } catch {
      // Fallback to basic user endpoint
      try {
        const user = await this.getUser(id);
        return {
          user,
          bookings: [],
          orders: [],
          payments: [],
          activities: [],
          pointsHistory: [],
        } as UserDetailsResponse;
      } catch (fallbackError) {
        console.error(`Error fetching user details for ${id}:`, fallbackError);
        throw fallbackError;
      }
    }
  }

  async createUser(
    data: CreateUserInput,
    options?: { twoFactorCode?: string }
  ): Promise<User> {
    try {
      const response = await api.post<User>("/users", data, {
        headers: options?.twoFactorCode
          ? { "X-2FA-Code": options.twoFactorCode }
          : undefined,
      });
      return response.data;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async updateUser(id: string, data: UpdateUserInput): Promise<User> {
    try {
      const response = await api.patch<User>(`/users/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating user ${id}:`, error);
      throw error;
    }
  }

  async deleteUser(
    id: string,
    options?: { twoFactorCode?: string }
  ): Promise<void> {
    try {
      await api.delete(`/users/${id}`, {
        headers: options?.twoFactorCode
          ? { "X-2FA-Code": options.twoFactorCode }
          : undefined,
      });
    } catch (error) {
      console.error(`Error deleting user ${id}:`, error);
      throw error;
    }
  }

  // ==================== Bulk Operations ====================

  async bulkUpdate(
    data: BulkUpdateInput,
    options?: { twoFactorCode?: string }
  ): Promise<BulkUpdateResult> {
    try {
      const response = await api.post<any>("/users/bulk-update", data, {
        headers: options?.twoFactorCode
          ? { "X-2FA-Code": options.twoFactorCode }
          : undefined,
      });
      // Backend returns { updatedCount: number }
      return {
        success: response.data.updatedCount || 0,
        updatedCount: response.data.updatedCount || 0,
        failed: 0,
        errors: [],
      };
    } catch (error) {
      console.error("Error in bulk update:", error);
      throw error;
    }
  }

  // Backend doesn't have /users/bulk-delete; perform client-side batch delete.
  async bulkDelete(userIds: string[]): Promise<BulkDeleteResult> {
    try {
      const results = await Promise.allSettled(
        userIds.map((id) => api.delete(`/users/${id}`))
      );

      const deleted = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      const errors = results
        .filter((r) => r.status === "rejected")
        .map((_, i) => userIds[i]);

      return { deleted, failed, errors };
    } catch (error) {
      console.error("Error in bulk delete:", error);
      throw error;
    }
  }

  // ==================== User Actions ====================
  async setActive(
    userId: string,
    active: boolean,
    options?: { twoFactorCode?: string }
  ): Promise<{ id: string; isActive: boolean; deactivatedAt: string | null }> {
    try {
      const response = await api.post(
        `/users/${userId}/deactivate`,
        { active },
        {
          headers: options?.twoFactorCode
            ? { "X-2FA-Code": options.twoFactorCode }
            : undefined,
        }
      );
      return response.data;
    } catch (error) {
      console.error(`Error updating active state for user ${userId}:`, error);
      throw error;
    }
  }

  async resetPassword(userId: string): Promise<void> {
    try {
      await api.post(`/users/${userId}/reset-password`);
    } catch (error) {
      console.error(`Error resetting password for user ${userId}:`, error);
      throw error;
    }
  }

  async sendVerificationEmail(userId: string): Promise<void> {
    try {
      await api.post(`/users/${userId}/send-verification`);
    } catch (error) {
      console.error(
        `Error sending verification email for user ${userId}:`,
        error
      );
      throw error;
    }
  }

  // Password reset is available via /auth/forgot-password
  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      await api.post("/auth/forgot-password", { email });
    } catch (error) {
      console.error(`Error sending password reset email to ${email}:`, error);
      throw error;
    }
  }

  async verifyEmail(userId: string, token: string): Promise<void> {
    void userId; // Suppress unused warning
    void token; // Suppress unused warning
    throw new Error("Not supported by API yet");
  }

  async verifyPhone(userId: string, code: string): Promise<void> {
    void userId; // Suppress unused warning
    void code; // Suppress unused warning
    throw new Error("Not supported by API yet");
  }

  // ==================== Impersonation ====================

  async impersonateUser(userId: string): Promise<ImpersonationToken> {
    // Store current user before impersonation
    const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
    localStorage.setItem("originalUser", JSON.stringify(currentUser));

    // Generate a temporary token for impersonation (in production, get from server)
    const impersonationToken = {
      token: `imp_${userId}_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
      originalUser: {
        id: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
      },
    };

    return impersonationToken;
  }

  async stopImpersonation(): Promise<void> {
    // No backend endpoint; clear client state
    localStorage.removeItem("impersonationToken");
    localStorage.removeItem("originalUser");
    window.location.href = "/admin/users";
  }

  isImpersonating(): boolean {
    return !!localStorage.getItem("impersonationToken");
  }

  getOriginalUser(): any {
    const originalUser = localStorage.getItem("originalUser");
    return originalUser ? JSON.parse(originalUser) : null;
  }

  // ==================== Export & Import ====================

  async exportUsers(
    filters: UserFilters,
    format: ExportFormat = "csv",
    options?: { twoFactorCode?: string }
  ): Promise<Blob> {
    try {
      const response = await api.get("/users/export", {
        params: { ...filters, format },
        responseType: "blob",
        headers: options?.twoFactorCode
          ? { "X-2FA-Session": options.twoFactorCode }
          : undefined,
      });
      return response.data;
    } catch (error) {
      // If server enforces rate limit, surface a clearer message
      const anyErr: any = error;
      const status = anyErr?.response?.status;
      if (status === 429) {
        const msg = "Too many export requests. Please try again later.";
        throw new Error(msg);
      }
      console.error("Error exporting users:", error);
      throw error;
    }
  }

  async importUsers(file: File): Promise<ImportResult> {
    void file; // Suppress unused warning
    throw new Error("Not supported by API yet");
  }

  async downloadImportTemplate(): Promise<Blob> {
    throw new Error("Not supported by API yet");
  }

  // ==================== Statistics ====================

  async getUserStats(filters?: UserFilters): Promise<UserStats> {
    try {
      const response = await api.get<any>("/users/stats", {
        params: filters ? this.cleanParams(filters) : undefined,
      });

      // Backend returns simplified stats, map to expected format
      const data = response.data;
      return {
        total: data.total || 0,
        active: data.active || 0,
        inactive: data.total - data.active || 0,
        verified: data.verified || 0,
        unverified: data.total - data.verified || 0,
        newThisMonth: data.newThisMonth || 0,
        newThisWeek: 0, // Not provided by backend
        newToday: 0, // Not provided by backend
        byRole: {}, // Not provided by backend
        byMembership: {}, // Not provided by backend
        averageSpent: 0, // Not provided by backend
        totalRevenue: 0, // Not provided by backend
      } as UserStats;
    } catch (error) {
      console.error("Error fetching user stats:", error);
      throw error;
    }
  }

  async getUserActivity(
    userId: string,
    params: ActivityParams
  ): Promise<ActivityLog[]> {
    void userId; // Suppress unused warning
    void params; // Suppress unused warning
    throw new Error("Not supported by API yet");
  }

  // Optional: map dashboard to user stats until dedicated endpoint exists
  async getDashboardStats(): Promise<any> {
    return this.getUserStats();
  }

  // ==================== Search ====================

  // Use GET /users?search=… as search backend
  async searchUsers(query: string, options?: SearchOptions): Promise<User[]> {
    try {
      const response = await api.get<UserResponse>("/users", {
        params: this.cleanParams({
          search: query,
          limit: options?.limit ?? 20,
          page: 1,
        }),
      });
      return response.data.users;
    } catch (error) {
      console.error("Error searching users:", error);
      throw error;
    }
  }

  async quickSearch(query: string): Promise<User[]> {
    try {
      const response = await api.get<UserResponse>("/users", {
        params: { search: query, limit: 5, page: 1 },
      });
      return response.data.users;
    } catch (error) {
      console.error("Error in quick search:", error);
      throw error;
    }
  }

  // Derive existence checks from search results (exact match client-side)
  async checkEmailExists(email: string): Promise<boolean> {
    try {
      const response = await api.get<UserResponse>("/users", {
        params: { search: email, limit: 5, page: 1 },
      });
      return response.data.users.some(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
    } catch (error) {
      console.error("Error checking email:", error);
      throw error;
    }
  }

  async checkPhoneExists(phone: string): Promise<boolean> {
    try {
      const response = await api.get<UserResponse>("/users", {
        params: { search: phone, limit: 5, page: 1 },
      });
      return response.data.users.some((u) => (u.phone || "") === phone);
    } catch (error) {
      console.error("Error checking phone:", error);
      throw error;
    }
  }

  // ==================== Utility Methods ====================

  private cleanParams(params: any): any {
    const cleaned: any = {};
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (
        value !== undefined &&
        value !== null &&
        value !== "" &&
        value !== "ALL"
      ) {
        if (value instanceof Date) {
          cleaned[key] = value.toISOString();
        } else if (typeof value === "object" && !Array.isArray(value)) {
          cleaned[key] = this.cleanParams(value);
        } else {
          cleaned[key] = value;
        }
      }
    });
    return cleaned;
  }

  cancelRequests(): void {
    this.cancelTokenSource.cancel("Request cancelled by user");
    this.cancelTokenSource = CancelToken.source();
  }
}

export const userService = new UserService();
