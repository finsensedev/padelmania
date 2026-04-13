import api from "src/utils/api";

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  imageUrl?: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parent?: ProductCategory;
  children?: ProductCategory[];
  _count?: {
    products: number;
  };
}

export interface CreateCategoryDto {
  name: string;
  description?: string;
  parentId?: string;
  imageUrl?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string;
  imageUrl?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
}

const categoryService = {
  async list(params?: {
    parentId?: string | null;
    isActive?: boolean;
    search?: string;
  }): Promise<ProductCategory[]> {
    const queryParams = new URLSearchParams();
    if (params?.parentId !== undefined) {
      queryParams.append("parentId", params.parentId === null ? "null" : params.parentId);
    }
    if (params?.isActive !== undefined) {
      queryParams.append("isActive", String(params.isActive));
    }
    if (params?.search) {
      queryParams.append("search", params.search);
    }
    const query = queryParams.toString();
    const { data } = await api.get(`/shop/categories${query ? `?${query}` : ""}`);
    return data.data || data;
  },

  async getTree(): Promise<ProductCategory[]> {
    const { data } = await api.get("/shop/categories/tree");
    return data.data || data;
  },

  async getById(id: string): Promise<ProductCategory> {
    const { data } = await api.get(`/shop/categories/${id}`);
    return data.data || data;
  },

  async create(payload: CreateCategoryDto): Promise<ProductCategory> {
    const { data } = await api.post("/shop/categories", payload);
    return data.data || data;
  },

  async update(id: string, payload: UpdateCategoryDto): Promise<ProductCategory> {
    const { data } = await api.patch(`/shop/categories/${id}`, payload);
    return data.data || data;
  },

  async delete(id: string): Promise<{ message: string }> {
    const { data } = await api.delete(`/shop/categories/${id}`);
    return data.data || data;
  },

  async permanentlyDelete(id: string): Promise<{ message: string }> {
    const { data } = await api.delete(`/shop/categories/${id}/permanent`);
    return data.data || data;
  },

  async reorder(categoryOrders: { id: string; displayOrder: number }[]): Promise<{ message: string }> {
    const { data } = await api.put("/shop/categories/reorder", { categoryOrders });
    return data.data || data;
  },
};

export default categoryService;
