import prisma from '../config/db';
import { InventoryChangeType } from '@prisma/client';
import { emitProductStockUpdated } from '../utils/ws-bus';
import { sendLowStockAlert } from '../utils/email.util';

interface AdjustStockDto {
  productId: string;
  variantId?: string;
  quantityChange: number;
  changeType?: InventoryChangeType;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  performedBy?: string;
}

interface InventoryFilters {
  productId?: string;
  variantId?: string;
  changeType?: InventoryChangeType;
  dateFrom?: Date;
  dateTo?: Date;
  performedBy?: string;
  page?: number;
  limit?: number;
}

export class InventoryService {
  /**
   * Adjust product stock
   */
  static async adjustStock(data: AdjustStockDto) {
    return await prisma.$transaction(async (tx) => {
      // Get current stock
      let currentStock: number;
      let targetEntity: 'product' | 'variant';

      if (data.variantId) {
        const variant = await tx.productVariant.findUnique({
          where: { id: data.variantId },
        });

        if (!variant) {
          throw new Error('Product variant not found');
        }

        currentStock = variant.stockQuantity;
        targetEntity = 'variant';
      } else {
        const product = await tx.product.findUnique({
          where: { id: data.productId },
        });

        if (!product) {
          throw new Error('Product not found');
        }

        currentStock = product.stockQuantity;
        targetEntity = 'product';
      }

      // Calculate new stock
      const newStock = currentStock + data.quantityChange;

      if (newStock < 0) {
        throw new Error('Insufficient stock. Cannot reduce stock below zero.');
      }

      // Update stock
      if (targetEntity === 'variant') {
        await tx.productVariant.update({
          where: { id: data.variantId },
          data: { stockQuantity: newStock },
        });
      } else {
        await tx.product.update({
          where: { id: data.productId },
          data: { stockQuantity: newStock },
        });
      }

      // Determine change type if not provided
      let changeType = data.changeType;
      if (!changeType) {
        if (data.quantityChange > 0) {
          changeType = 'RESTOCK';
        } else {
          changeType = 'ADJUSTMENT';
        }
      }

      // Create inventory log
      const log = await tx.inventoryLog.create({
        data: {
          productId: data.productId,
          variantId: data.variantId,
          changeType,
          quantityBefore: currentStock,
          quantityChange: data.quantityChange,
          quantityAfter: newStock,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          reason: data.reason,
          performedBy: data.performedBy,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
        },
      });

      // Emit socket event for real-time stock updates (only for product, not variants)
      if (targetEntity === 'product' && log.product) {
        emitProductStockUpdated({
          productId: data.productId,
          newStock,
          productName: log.product.name,
        });
      }

      return log;
    });
  }

  /**
   * Get inventory logs with filters
   */
  static async getInventoryLogs(filters: InventoryFilters = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.productId) {
      where.productId = filters.productId;
    }

    if (filters.variantId) {
      where.variantId = filters.variantId;
    }

    if (filters.changeType) {
      where.changeType = filters.changeType;
    }

    if (filters.performedBy) {
      where.performedBy = filters.performedBy;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }

    const [logs, totalCount] = await Promise.all([
      prisma.inventoryLog.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inventoryLog.count({ where }),
    ]);

    return {
      logs,
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
   * Get stock history for a specific product or variant
   */
  static async getStockHistory(productId: string, variantId?: string) {
    const where: any = { productId };

    if (variantId) {
      where.variantId = variantId;
    }

    const logs = await prisma.inventoryLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return logs;
  }

  /**
   * Get low stock products (stock at or below threshold)
   */
  static async getLowStockProducts() {
    // Get products with low stock
    const products = await prisma.$queryRaw<any[]>`
      SELECT 
        p.id,
        p.name,
        p.sku,
        p.stock_quantity as "stockQuantity",
        p.low_stock_threshold as "lowStockThreshold",
        pc.name as "categoryName"
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.is_active = true 
      AND p.stock_quantity <= p.low_stock_threshold
      ORDER BY p.stock_quantity ASC
    `;

    // Get variants with low stock
    const variants = await prisma.$queryRaw<any[]>`
      SELECT 
        pv.id,
        pv.name as "variantName",
        pv.sku,
        pv.stock_quantity as "stockQuantity",
        p.name as "productName",
        p.low_stock_threshold as "lowStockThreshold",
        pc.name as "categoryName"
      FROM product_variants pv
      INNER JOIN products p ON pv.product_id = p.id
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE pv.is_active = true 
      AND p.is_active = true
      AND pv.stock_quantity <= p.low_stock_threshold
      ORDER BY pv.stock_quantity ASC
    `;

    return {
      products,
      variants,
    };
  }

  /**
   * Get out of stock products
   */
  static async getOutOfStockProducts() {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        stockQuantity: 0,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        images: {
          where: { isPrimary: true },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    const variants = await prisma.productVariant.findMany({
      where: {
        isActive: true,
        stockQuantity: 0,
        product: {
          isActive: true,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      products,
      variants,
    };
  }

  /**
   * Get inventory value (cost * quantity)
   */
  static async getInventoryValue() {
    const result = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(SUM(p.cost_price * p.stock_quantity), 0)::float as "totalValue",
        COALESCE(SUM(p.stock_quantity), 0)::int as "totalQuantity",
        COUNT(*)::int as "productCount"
      FROM products p
      WHERE p.is_active = true 
      AND p.cost_price IS NOT NULL
    `;

    return result[0] || { totalValue: 0, totalQuantity: 0, productCount: 0 };
  }

  /**
   * Get inventory statistics
   */
  static async getInventoryStats() {
    const [
      totalProducts,
      activeProducts,
      lowStockProductsResult,
      lowStockVariantsResult,
      outOfStockProductsCount,
      outOfStockVariantsCount,
      inventoryValue,
      profitValue,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as count 
        FROM products 
        WHERE is_active = true 
        AND stock_quantity > 0 
        AND stock_quantity <= low_stock_threshold
      `,
      prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as count 
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE pv.is_active = true 
        AND p.is_active = true
        AND pv.stock_quantity > 0 
        AND pv.stock_quantity <= p.low_stock_threshold
      `,
      prisma.product.count({
        where: {
          isActive: true,
          stockQuantity: 0,
        },
      }),
      prisma.productVariant.count({
        where: {
          isActive: true,
          stockQuantity: 0,
          product: { isActive: true }
        },
      }),
      this.getInventoryValue(),
      // Calculate expected profit: (base_price - cost_price) * stock_quantity
      prisma.$queryRaw<any[]>`
        SELECT 
          COALESCE(SUM((base_price - COALESCE(cost_price, 0)) * stock_quantity), 0)::float as "totalProfit"
        FROM products 
        WHERE is_active = true 
        AND cost_price IS NOT NULL
        AND stock_quantity > 0
      `,
    ]);

    const lowStockCount = (Number(lowStockProductsResult[0]?.count) || 0) + (Number(lowStockVariantsResult[0]?.count) || 0);
    const outOfStockCount = outOfStockProductsCount + outOfStockVariantsCount;

    return {
      totalProducts,
      activeProducts,
      lowStockCount,
      outOfStockCount,
      inventoryValue: Number(inventoryValue.totalValue) || 0,
      totalQuantity: Number(inventoryValue.totalQuantity) || 0,
      expectedProfit: Number(profitValue[0]?.totalProfit) || 0,
    };
  }

  /**
   * Bulk stock adjustment (for multiple products/variants)
   */
  static async bulkAdjustStock(
    adjustments: AdjustStockDto[],
    performedBy?: string
  ) {
    const results = [];
    
    for (const adjustment of adjustments) {
      const log = await this.adjustStock({
        ...adjustment,
        performedBy: performedBy || adjustment.performedBy,
      });
      results.push(log);
    }

    return {
      success: true,
      adjusted: results.length,
      logs: results,
    };
  }

  /**
   * Check for low stock products and send email alert
   */
  static async checkAndNotifyLowStock() {
    try {
      // Find products with stock <= 2 or out of stock
      const lowStockProducts = await prisma.product.findMany({
        where: {
          AND: [
            { isActive: true },
            {
              OR: [
                { stockQuantity: 0 },
                { stockQuantity: { lte: 2, gt: 0 } },
              ],
            },
          ],
        },
        include: {
          category: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [
          { stockQuantity: 'asc' },
          { name: 'asc' },
        ],
      });

      if (lowStockProducts.length === 0) {
        console.log('No low stock products found');
        return { sent: false, count: 0 };
      }

      // Get manager email from system settings or environment
      const managerEmail = process.env.MANAGER_EMAIL || process.env.ADMIN_EMAIL;
      
      if (!managerEmail) {
        console.warn('No manager email configured for low stock alerts');
        return { sent: false, count: lowStockProducts.length, reason: 'No manager email configured' };
      }

      // Send alert
      await sendLowStockAlert(managerEmail, lowStockProducts);

      return {
        sent: true,
        count: lowStockProducts.length,
        email: managerEmail,
      };
    } catch (error) {
      console.error('Error checking/notifying low stock:', error);
      throw error;
    }
  }

  /**
   * Check if a specific product is low on stock after stock change
   */
  static async checkProductStockLevel(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!product) {
      return null;
    }

    // Check if stock is critical (0, 1, or 2)
    if (product.stockQuantity <= 2 && product.isActive) {
      const managerEmail = process.env.MANAGER_EMAIL || process.env.ADMIN_EMAIL;
      
      if (managerEmail) {
        try {
          await sendLowStockAlert(managerEmail, [product]);
          console.log(`Low stock alert sent for product: ${product.name}`);
        } catch (error) {
          console.error(`Failed to send low stock alert for ${product.name}:`, error);
        }
      }

      return {
        isLowStock: true,
        stockLevel: product.stockQuantity,
        product: product,
      };
    }

    return {
      isLowStock: false,
      stockLevel: product.stockQuantity,
    };
  }
}
