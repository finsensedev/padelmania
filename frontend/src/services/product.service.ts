import api from "src/utils/api";
import type { ProductCategory } from "./category.service";

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  brand?: string;
  sku?: string;
  basePrice: number;
  salePrice?: number;
  costPrice?: number;
  stockQuantity: number;
  lowStockThreshold: number;
  weight?: number;
  dimensions?: Record<string, any>;
  specifications?: Record<string, any>;
  metaTitle?: string;
  metaDescription?: string;
  tags: string[];
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  displayOrder: number;
  isActive: boolean;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  category?: ProductCategory;
  images?: ProductImage[];
  variants?: ProductVariant[];
  reviews?: ProductReview[];
  _count?: {
    reviews: number;
    variants: number;
  };
}

export interface ProductImage {
  id: string;
  productId: string;
  variantId?: string;
  imageUrl: string;
  altText?: string;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku?: string;
  options: Record<string, string>;
  price?: number;
  salePrice?: number;
  stockQuantity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  images?: ProductImage[];
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  orderId?: string;
  rating: number;
  title?: string;
  comment: string;
  images: string[];
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  moderatedAt?: string;
  moderatedBy?: string;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
}

export interface CreateProductDto {
  categoryId: string;
  name: string;
  description: string;
  shortDescription?: string;
  brand?: string;
  sku?: string;
  basePrice: number;
  salePrice?: number;
  costPrice?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  weight?: number;
  dimensions?: Record<string, any>;
  specifications?: Record<string, any>;
  metaTitle?: string;
  metaDescription?: string;
  tags?: string[];
  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
  displayOrder?: number;
  isActive?: boolean;
  images?: {
    imageUrl: string;
    altText?: string;
    displayOrder: number;
    isPrimary: boolean;
  }[];
  variants?: {
    name: string;
    sku?: string;
    options: Record<string, string>;
    price?: number;
    salePrice?: number;
    stockQuantity?: number;
  }[];
}

export interface UpdateProductDto {
  categoryId?: string;
  name?: string;
  description?: string;
  shortDescription?: string;
  brand?: string;
  sku?: string;
  basePrice?: number;
  salePrice?: number;
  costPrice?: number;
  stockQuantity?: number;
  lowStockThreshold?: number;
  weight?: number;
  dimensions?: Record<string, any>;
  specifications?: Record<string, any>;
  metaTitle?: string;
  metaDescription?: string;
  tags?: string[];
  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
  displayOrder?: number;
  isActive?: boolean;
  publishedAt?: Date | null;
}

export interface ProductFilters {
  categoryId?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
  isActive?: boolean;
  inStock?: boolean;
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "name" | "basePrice" | "stockQuantity";
  sortOrder?: "asc" | "desc";
}

export interface ProductListResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

const productService = {
  async list(filters?: ProductFilters): Promise<ProductListResponse> {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => queryParams.append(key, String(v)));
          } else {
            queryParams.append(key, String(value));
          }
        }
      });
    }
    const query = queryParams.toString();
    const { data } = await api.get(`/shop/products${query ? `?${query}` : ""}`);
    return data.data || data;
  },

  async getById(id: string): Promise<Product> {
    const { data } = await api.get(`/shop/products/${id}`);
    return data.data || data;
  },

  async create(payload: CreateProductDto | FormData, twoFACode?: string): Promise<Product> {
    const { data } = await api.post("/shop/products", payload, {
      headers: twoFACode ? { "X-2FA-Code": twoFACode } : undefined,
    });
    return data.data || data;
  },

  async update(id: string, payload: UpdateProductDto, twoFACode?: string): Promise<Product> {
    const { data } = await api.patch(`/shop/products/${id}`, payload, {
      headers: twoFACode ? { "X-2FA-Code": twoFACode } : undefined,
    });
    return data.data || data;
  },

  async delete(id: string, twoFACode?: string): Promise<{ message: string }> {
    const { data } = await api.delete(`/shop/products/${id}`, {
      headers: twoFACode ? { "X-2FA-Code": twoFACode } : undefined,
    });
    return data.data || data;
  },

  async updateStock(
    id: string,
    quantityChange: number,
    reason: string,
    twoFACode?: string
  ): Promise<any> {
    const { data } = await api.patch(`/shop/products/${id}/stock`, {
      quantityChange,
      reason,
    }, {
      headers: twoFACode ? { "X-2FA-Code": twoFACode } : undefined,
    });
    return data.data || data;
  },

  async uploadImages(files: File[]): Promise<{ imageUrls: string[] }> {
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));
    const { data } = await api.post("/shop/products/images/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data.data || data;
  },

  async addImages(
    productId: string,
    images: {
      imageUrl: string;
      altText?: string;
      displayOrder: number;
      isPrimary?: boolean;
    }[],
    twoFACode?: string
  ): Promise<any> {
    const { data } = await api.post(`/shop/products/${productId}/images`, { images }, {
      headers: twoFACode ? { "X-2FA-Code": twoFACode } : undefined,
    });
    return data.data || data;
  },

  async removeImage(imageId: string, deleteFromCloud = false): Promise<{ message: string }> {
    const { data } = await api.delete(
      `/shop/products/images/${imageId}${deleteFromCloud ? "?deleteFromCloud=true" : ""}`
    );
    return data.data || data;
  },

  async updateImageOrder(
    imageOrders: { id: string; displayOrder: number }[]
  ): Promise<{ message: string }> {
    const { data } = await api.put("/shop/products/images/reorder", { imageOrders });
    return data.data || data;
  },

  async setPrimaryImage(imageId: string): Promise<{ message: string }> {
    const { data } = await api.put(`/shop/products/images/${imageId}/primary`);
    return data.data || data;
  },

  async getLowStock(): Promise<Product[]> {
    const { data } = await api.get("/shop/products/low-stock");
    return data.data || data;
  },

  async getBrands(): Promise<string[]> {
    const { data } = await api.get("/shop/products/brands");
    return data.data || data;
  },

  async getTags(): Promise<string[]> {
    const { data } = await api.get("/shop/products/tags");
    return data.data || data;
  },
};

export default productService;
