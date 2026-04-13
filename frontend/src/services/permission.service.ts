import api from "src/utils/api";

export interface MyPermissionsResponse {
  permissions: string[];
  role?: string;
}

class PermissionService {
  private baseUrl = "/roles";

  async getMyPermissions(): Promise<MyPermissionsResponse> {
    const res = await api.get(`${this.baseUrl}/me/permissions`);
    return res.data;
  }

  async has(permission: string): Promise<boolean> {
    const res = await api.get(`${this.baseUrl}/check-permission`, {
      params: { permission },
    });
    return !!res.data?.hasPermission;
  }
}

export const permissionService = new PermissionService();
