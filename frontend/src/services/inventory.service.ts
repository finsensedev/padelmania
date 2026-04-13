import api from "src/utils/api";

export interface InventoryLog {
  id: string;
  productId: string;
  variantId?: string;
  changeType:
    | "PURCHASE"
    | "SALE"
    | "RETURN"
    | "ADJUSTMENT"
    | "RESTOCK"
    | "DAMAGE"
    | "LOST"
    | "PROMOTION"
    | "TRANSFER";
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  performedBy?: string;
  createdAt: string;
  product?: {
    id: string;
    name: string;
    sku?: string;
  };
  variant?: {
    id: string;
    name: string;
    sku?: string;
  };
}

export interface InventoryFilters {
  productId?: string;
  variantId?: string;
  changeType?: string;
  dateFrom?: string;
  dateTo?: string;
  performedBy?: string;
  page?: number;
  limit?: number;
}

export interface InventoryLogResponse {
  logs: InventoryLog[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface InventoryStats {
  totalProducts: number;
  activeProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  inventoryValue: number;
  totalQuantity: number;
  expectedProfit: number;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku?: string;
  stockQuantity: number;
  lowStockThreshold: number;
  categoryName?: string;
  variantName?: string;
  productName?: string;
}

export interface AdjustStockDto {
  productId: string;
  variantId?: string;
  quantityChange: number;
  changeType?:
    | "PURCHASE"
    | "SALE"
    | "RETURN"
    | "ADJUSTMENT"
    | "RESTOCK"
    | "DAMAGE"
    | "LOST"
    | "PROMOTION"
    | "TRANSFER";
  reason: string;
  referenceType?: string;
  referenceId?: string;
}

const inventoryService = {
  async adjustStock(payload: AdjustStockDto): Promise<InventoryLog> {
    const { data } = await api.post("/shop/inventory/adjust", payload);
    return data.data || data;
  },

  async bulkAdjustStock(
    adjustments: AdjustStockDto[]
  ): Promise<{ success: boolean; adjusted: number; logs: InventoryLog[] }> {
    const { data } = await api.post("/shop/inventory/bulk-adjust", { adjustments });
    return data.data || data;
  },

  async getLogs(filters?: InventoryFilters): Promise<InventoryLogResponse> {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const { data } = await api.get(`/shop/inventory/logs${query ? `?${query}` : ""}`);
    return data.data || data;
  },

  async getStockHistory(productId: string, variantId?: string): Promise<InventoryLog[]> {
    const query = variantId ? `?variantId=${variantId}` : "";
    const { data } = await api.get(`/shop/inventory/history/${productId}${query}`);
    return data.data || data;
  },

  async getLowStock(): Promise<{ products: LowStockItem[]; variants: LowStockItem[] }> {
    const { data } = await api.get("/shop/inventory/low-stock");
    return data.data || data;
  },

  async getOutOfStock(): Promise<{ products: any[]; variants: any[] }> {
    const { data } = await api.get("/shop/inventory/out-of-stock");
    return data.data || data;
  },

  async getInventoryValue(): Promise<{
    totalValue: number;
    totalQuantity: number;
    productCount: number;
  }> {
    const { data } = await api.get("/shop/inventory/value");
    return data.data || data;
  },

  async getStats(): Promise<InventoryStats> {
    const { data } = await api.get("/shop/inventory/stats");
    return data.data || data;
  },
};

export default inventoryService;
