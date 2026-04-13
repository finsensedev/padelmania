import api from "src/utils/api";

export interface AuditLogItem {
  id: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    role: string;
  } | null;
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  entity?: string;
  userId?: string;
  from?: string; // ISO
  to?: string; // ISO
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  includeRead?: boolean;
}

export interface PagedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    includeRead?: boolean;
    suppressed?: number;
    totalIncludingRead?: number;
  };
}

export const auditService = {
  async list(params: AuditQuery = {}): Promise<PagedResult<AuditLogItem>> {
    const { data } = await api.get("/audit-logs", { params });
    return data;
  },

  async getById(id: string): Promise<AuditLogItem> {
    const { data } = await api.get(`/audit-logs/${id}`);
    return data;
  },

  async exportCsv(params: AuditQuery = {}): Promise<Blob> {
    const { data } = await api.get(`/audit-logs/export`, {
      params,
      responseType: "blob",
    });
    return data as Blob;
  },
};

export default auditService;
