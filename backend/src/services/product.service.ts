import prisma from '../config/db';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { emitProductAdded, emitProductUpdated, emitProductRemoved } from '../utils/ws-bus';

interface CreateProductDto {
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
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    unit?: string;
  };
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

interface UpdateProductDto {
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

interface ProductFilters {
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
  sortBy?: 'createdAt' | 'name' | 'basePrice' | 'stockQuantity';
  sortOrder?: 'asc' | 'desc';
}

export class ProductService {
  /**
   * Create a new product with images and variants
   */
  static async createProduct(data: CreateProductDto, performedBy?: string) {
    // Generate slug from name
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if slug already exists
    const existingProduct = await prisma.product.findUnique({
      where: { slug },
    });

    if (existingProduct) {
      throw new Error(`Product with name "${data.name}" already exists`);
    }

    // Verify category exists
    const category = await prisma.productCategory.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    // Check SKU uniqueness if provided
    if (data.sku) {
      const existingSku = await prisma.product.findUnique({
        where: { sku: data.sku },
      });

      if (existingSku) {
        throw new Error(`Product with SKU "${data.sku}" already exists`);
      }
    }

    // Create product with images and variants in a transaction
    const product = await prisma.$transaction(async (tx) => {
      // Create the product
      const newProduct = await tx.product.create({
        data: {
          categoryId: data.categoryId,
          name: data.name,
          slug,
          description: data.description,
          shortDescription: data.shortDescription,
          brand: data.brand,
          sku: data.sku,
          basePrice: data.basePrice,
          salePrice: data.salePrice,
          costPrice: data.costPrice,
          stockQuantity: data.stockQuantity ?? 0,
          lowStockThreshold: data.lowStockThreshold ?? 5,
          weight: data.weight,
          dimensions: data.dimensions as Prisma.InputJsonValue,
          specifications: data.specifications as Prisma.InputJsonValue,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          tags: data.tags,
          featured: data.featured ?? false,
          newArrival: data.newArrival ?? false,
          bestSeller: data.bestSeller ?? false,
          displayOrder: data.displayOrder ?? 0,
          isActive: data.isActive ?? true,
          publishedAt: data.isActive ? new Date() : null,
        },
      });

      // Create images if provided
      if (data.images && data.images.length > 0) {
        await tx.productImage.createMany({
          data: data.images.map((img) => ({
            productId: newProduct.id,
            imageUrl: img.imageUrl,
            altText: img.altText || data.name,
            displayOrder: img.displayOrder,
            isPrimary: img.isPrimary,
          })),
        });
      }

      // Create variants if provided
      if (data.variants && data.variants.length > 0) {
        await Promise.all(
          data.variants.map(async (variant) => {
            // Check variant SKU uniqueness if provided
            if (variant.sku) {
              const existingVariantSku = await tx.productVariant.findUnique({
                where: { sku: variant.sku },
              });
              if (existingVariantSku) {
                throw new Error(`Variant with SKU "${variant.sku}" already exists`);
              }
            }

            const newVariant = await tx.productVariant.create({
              data: {
                productId: newProduct.id,
                name: variant.name,
                sku: variant.sku,
                options: variant.options as Prisma.InputJsonValue,
                price: variant.price,
                salePrice: variant.salePrice,
                stockQuantity: variant.stockQuantity ?? 0,
              },
            });

            // Log initial stock for variant if any
            if ((variant.stockQuantity ?? 0) > 0) {
              await tx.inventoryLog.create({
                data: {
                  productId: newProduct.id,
                  variantId: newVariant.id,
                  changeType: 'RESTOCK',
                  quantityBefore: 0,
                  quantityChange: variant.stockQuantity!,
                  quantityAfter: variant.stockQuantity!,
                  reason: 'Initial stock',
                  performedBy,
                },
              });
            }

            return newVariant;
          })
        );
      }

      // Log initial stock if any
      if ((data.stockQuantity ?? 0) > 0) {
        await tx.inventoryLog.create({
          data: {
            productId: newProduct.id,
            changeType: 'RESTOCK',
            quantityBefore: 0,
            quantityChange: data.stockQuantity!,
            quantityAfter: data.stockQuantity!,
            reason: 'Initial stock',
            performedBy,
          },
        });
      }

      return newProduct;
    });

    // Fetch the complete product with all relations
    const completeProduct = await this.getProductById(product.id);
    
    // Emit socket event for real-time updates
    emitProductAdded({ product: completeProduct });
    
    return completeProduct;
  }

  /**
   * List products with filters and pagination
   */
  static async listProducts(filters: ProductFilters = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.brand) {
      where.brand = filters.brand;
    }

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.basePrice = {};
      if (filters.minPrice !== undefined) {
        where.basePrice.gte = filters.minPrice;
      }
      if (filters.maxPrice !== undefined) {
        where.basePrice.lte = filters.maxPrice;
      }
    }

    if (filters.featured !== undefined) {
      where.featured = filters.featured;
    }

    if (filters.newArrival !== undefined) {
      where.newArrival = filters.newArrival;
    }

    if (filters.bestSeller !== undefined) {
      where.bestSeller = filters.bestSeller;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.inStock) {
      // Check both main product stock and variant stock
      if (!where.AND) where.AND = [];
      if (Array.isArray(where.AND)) {
        where.AND.push({
          OR: [
            { stockQuantity: { gt: 0 } },
            { variants: { some: { stockQuantity: { gt: 0 }, isActive: true } } }
          ]
        });
      }
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { brand: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    // Determine order by
    const orderBy: Prisma.ProductOrderByWithRelationInput = {};
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';
    orderBy[sortBy] = sortOrder;

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
          images: {
            orderBy: { displayOrder: 'asc' },
          },
          variants: {
            where: { isActive: true },
            take: 5,
          },
          _count: {
            select: {
              reviews: true,
              variants: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      products,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get a single product by ID with all relations
   */
  static async getProductById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          include: {
            parent: true,
          },
        },
        images: {
          orderBy: { displayOrder: 'asc' },
        },
        variants: {
          where: { isActive: true },
          include: {
            images: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
        reviews: {
          where: { isApproved: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
        _count: {
          select: {
            reviews: true,
          },
        },
      },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    return product;
  }

  /**
   * Get a product by slug
   */
  static async getProductBySlug(slug: string) {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: {
          include: {
            parent: true,
          },
        },
        images: {
          orderBy: { displayOrder: 'asc' },
        },
        variants: {
          where: { isActive: true },
          include: {
            images: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
        reviews: {
          where: { isApproved: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
        _count: {
          select: {
            reviews: true,
          },
        },
      },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    return product;
  }

  /**
   * Update a product
   */
  static async updateProduct(id: string, data: UpdateProductDto) {
    // Verify product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      throw new Error('Product not found');
    }

    // If name is being updated, regenerate slug
    let slug: string | undefined;
    if (data.name && data.name !== existingProduct.name) {
      slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Check if new slug conflicts
      const slugConflict = await prisma.product.findFirst({
        where: {
          slug,
          NOT: { id },
        },
      });

      if (slugConflict) {
        throw new Error(`Product with name "${data.name}" already exists`);
      }
    }

    // If categoryId is being updated, verify it exists
    if (data.categoryId) {
      const category = await prisma.productCategory.findUnique({
        where: { id: data.categoryId },
      });

      if (!category) {
        throw new Error('Category not found');
      }
    }

    // If SKU is being updated, check uniqueness (only if it's a non-empty value)
    if (data.sku && data.sku.trim() !== '' && data.sku !== existingProduct.sku) {
      const existingSku = await prisma.product.findFirst({
        where: {
          sku: data.sku,
          NOT: { id },
        },
      });

      if (existingSku) {
        throw new Error(`Product with SKU "${data.sku}" already exists`);
      }
    }

    // Prepare SKU value - convert empty string to null
    const skuValue = data.sku && data.sku.trim() !== '' ? data.sku.trim() : null;

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        categoryId: data.categoryId,
        name: data.name,
        slug,
        description: data.description,
        shortDescription: data.shortDescription,
        brand: data.brand,
        sku: data.sku !== undefined ? skuValue : undefined, // Only update if provided
        basePrice: data.basePrice,
        salePrice: data.salePrice,
        costPrice: data.costPrice,
        lowStockThreshold: data.lowStockThreshold,
        weight: data.weight,
        dimensions: data.dimensions as Prisma.InputJsonValue,
        specifications: data.specifications as Prisma.InputJsonValue,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        tags: data.tags,
        featured: data.featured,
        newArrival: data.newArrival,
        bestSeller: data.bestSeller,
        displayOrder: data.displayOrder,
        isActive: data.isActive,
        publishedAt: data.publishedAt,
      },
    });

    const completeProduct = await this.getProductById(updatedProduct.id);
    
    // Emit socket event for real-time updates
    emitProductUpdated({ product: completeProduct });
    
    return completeProduct;
  }

  /**
   * Update product stock
   */
  static async updateStock(
    productId: string,
    quantityChange: number,
    reason: string,
    performedBy?: string
  ) {
    const log = await InventoryService.adjustStock({
      productId,
      quantityChange,
      reason,
      performedBy,
    });

    // Check if product is out of stock and emit removal event
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (product && product.stockQuantity === 0) {
      emitProductRemoved({
        productId,
        productName: product.name,
      });
    }

    // Check stock level and send email if low (async, don't wait)
    InventoryService.checkProductStockLevel(productId).catch((error: unknown) => {
      console.error('Error checking product stock level:', error);
    });

    return log;
  }

  /**
   * Delete a product (soft delete)
   */
  static async deleteProduct(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            orderItems: true,
          },
        },
      },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    if (product._count.orderItems > 0) {
      // Soft delete - just deactivate
      const deactivatedProduct = await prisma.product.update({
        where: { id },
        data: { isActive: false },
      });

      // Emit socket event for product removal (deactivation)
      emitProductRemoved({ 
        productId: id, 
        productName: deactivatedProduct.name 
      });

      return { message: 'Product deactivated (has existing orders)' };
    }

    // Can permanently delete if no orders
    await prisma.product.delete({
      where: { id },
    });

    // Emit socket event for product removal (deletion)
    emitProductRemoved({ 
      productId: id, 
      productName: product.name 
    });

    return { message: 'Product deleted successfully' };
  }

  /**
   * Add images to a product
   */
  static async addImages(
    productId: string,
    images: {
      imageUrl: string;
      altText?: string;
      displayOrder: number;
      isPrimary?: boolean;
    }[]
  ) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    // If any image is marked as primary, unmark existing primary images
    if (images.some((img) => img.isPrimary)) {
      await prisma.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const createdImages = await prisma.productImage.createMany({
      data: images.map((img) => ({
        productId,
        imageUrl: img.imageUrl,
        altText: img.altText || product.name,
        displayOrder: img.displayOrder,
        isPrimary: img.isPrimary ?? false,
      })),
    });

    return createdImages;
  }

  /**
   * Remove an image from a product
   */
  static async removeImage(imageId: string) {
    const image = await prisma.productImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new Error('Image not found');
    }

    await prisma.productImage.delete({
      where: { id: imageId },
    });

    return { message: 'Image removed successfully' };
  }

  /**
   * Update image order
   */
  static async updateImageOrder(imageOrders: { id: string; displayOrder: number }[]) {
    await prisma.$transaction(
      imageOrders.map(({ id, displayOrder }) =>
        prisma.productImage.update({
          where: { id },
          data: { displayOrder },
        })
      )
    );

    return { message: 'Image order updated successfully' };
  }

  /**
   * Set primary image
   */
  static async setPrimaryImage(imageId: string) {
    const image = await prisma.productImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new Error('Image not found');
    }

    // Unmark current primary image
    await prisma.productImage.updateMany({
      where: { productId: image.productId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Set new primary image
    await prisma.productImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    });

    return { message: 'Primary image updated successfully' };
  }

  /**
   * Get low stock products
   */
  static async getLowStockProducts() {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          {
            stockQuantity: {
              lte: prisma.product.fields.lowStockThreshold,
            },
          },
        ],
      },
      include: {
        category: true,
        images: {
          where: { isPrimary: true },
          take: 1,
        },
      },
      orderBy: {
        stockQuantity: 'asc',
      },
    });

    return products;
  }

  /**
   * Get all unique brands
   */
  static async getBrands() {
    const products = await prisma.product.findMany({
      where: {
        brand: { not: null },
        isActive: true,
      },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
    });

    return products.map((p) => p.brand).filter((b): b is string => b !== null);
  }

  /**
   * Get all unique tags
   */
  static async getTags() {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        tags: { isEmpty: false },
      },
      select: { tags: true },
    });

    const allTags = products.flatMap((p) => p.tags);
    return Array.from(new Set(allTags)).sort();
  }
}
