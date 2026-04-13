/* eslint-disable @typescript-eslint/no-explicit-any */
import api from "src/utils/api";

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  priority: number;
  userCount?: number;
  users?: any[];
}

export interface Permission {
  code: string;
  name: string;
  category: string;
}

export interface PermissionsResponse {
  permissions: Permission[];
  grouped: Record<string, Permission[]>;
}

class RolesService {
  // axios baseURL already ends with /api, so use path under it
  private baseUrl = "/roles";

  async getRoles(): Promise<Role[]> {
    const response = await api.get(this.baseUrl);
    return response.data;
  }

  async getRole(
    id: string,
    options?: { twoFactorSession?: string }
  ): Promise<Role> {
    const response = await api.get(`${this.baseUrl}/${id}`, {
      headers: options?.twoFactorSession
        ? { "X-2FA-Session": options.twoFactorSession }
        : undefined,
    });
    return response.data;
  }

  async getAllPermissions(options?: {
    twoFactorSession?: string;
  }): Promise<PermissionsResponse> {
    const response = await api.get(`${this.baseUrl}/permissions/all`, {
      headers: options?.twoFactorSession
        ? { "X-2FA-Session": options.twoFactorSession }
        : undefined,
    });
    return response.data;
  }

  async updateRolePermissions(
    roleId: string,
    permissions: string[],
    options?: { twoFactorSession?: string }
  ): Promise<any> {
    const response = await api.post(
      `${this.baseUrl}/${roleId}/permissions`,
      { permissions },
      {
        headers: options?.twoFactorSession
          ? { "X-2FA-Session": options.twoFactorSession }
          : undefined,
      }
    );
    return response.data;
  }

  async assignUsersToRole(
    roleId: string,
    userIds: string[],
    options?: { twoFactorSession?: string }
  ): Promise<any> {
    const response = await api.post(
      `${this.baseUrl}/${roleId}/assign-users`,
      { userIds },
      {
        headers: options?.twoFactorSession
          ? { "X-2FA-Session": options.twoFactorSession }
          : undefined,
      }
    );
    return response.data;
  }

  async checkPermission(permission: string): Promise<boolean> {
    const response = await api.get(`${this.baseUrl}/check-permission`, {
      params: { permission },
    });
    return response.data.hasPermission;
  }
}

export const rolesService = new RolesService();
