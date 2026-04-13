import { Request, Response } from 'express';
import { InventoryService } from '../../services/inventory.service';

export class InventoryController {
  /**
   * Success response helper
   */
  private static ok(res: Response, data: unknown, message = 'OK') {
    return res.json({ success: true, message, data });
  }

  /**
   * Error response helper
   */
  private static fail(res: Response, message = 'Bad Request', code = 400) {
    return res.status(code).json({ success: false, message });
  }

  /**
   * Adjust product or variant stock
   * POST /api/admin/shop/inventory/adjust
   */
  static async adjustStock(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { productId, variantId, quantityChange, changeType, reason, referenceType, referenceId } = req.body;

      if (!productId) {
        return InventoryController.fail(res, 'productId is required', 400);
      }

      if (typeof quantityChange !== 'number') {
        return InventoryController.fail(res, 'quantityChange must be a number', 400);
      }

      if (!reason) {
        return InventoryController.fail(res, 'reason is required', 400);
      }

      const log = await InventoryService.adjustStock({
        productId,
        variantId,
        quantityChange,
        changeType,
        reason,
        referenceType,
        referenceId,
        performedBy: userId,
      });

      return InventoryController.ok(res, log, 'Stock adjusted successfully');
    } catch (error: any) {
      console.error('Error adjusting stock:', error);
      return InventoryController.fail(res, error.message || 'Failed to adjust stock', 500);
    }
  }

  /**
   * Get inventory logs with filters
   * GET /api/admin/shop/inventory/logs
   */
  static async getInventoryLogs(req: Request, res: Response) {
    try {
      const {
        productId,
        variantId,
        changeType,
        dateFrom,
        dateTo,
        performedBy,
        page,
        limit,
      } = req.query;

      const filters: any = {};

      if (productId) filters.productId = String(productId);
      if (variantId) filters.variantId = String(variantId);
      if (changeType) filters.changeType = String(changeType);
      if (performedBy) filters.performedBy = String(performedBy);
      if (dateFrom) filters.dateFrom = new Date(String(dateFrom));
      if (dateTo) filters.dateTo = new Date(String(dateTo));
      if (page) filters.page = parseInt(String(page));
      if (limit) filters.limit = parseInt(String(limit));

      const result = await InventoryService.getInventoryLogs(filters);
      return InventoryController.ok(res, result);
    } catch (error: any) {
      console.error('Error fetching inventory logs:', error);
      return InventoryController.fail(res, error.message || 'Failed to fetch inventory logs', 500);
    }
  }

  /**
   * Get stock history for a product or variant
   * GET /api/admin/shop/inventory/history/:productId
   */
  static async getStockHistory(req: Request, res: Response) {
    try {
      const { productId } = req.params;
      const { variantId } = req.query;

      const logs = await InventoryService.getStockHistory(
        productId,
        variantId ? String(variantId) : undefined
      );

      return InventoryController.ok(res, logs);
    } catch (error: any) {
      console.error('Error fetching stock history:', error);
      return InventoryController.fail(res, error.message || 'Failed to fetch stock history', 500);
    }
  }

  /**
   * Get low stock products
   * GET /api/admin/shop/inventory/low-stock
   */
  static async getLowStockProducts(req: Request, res: Response) {
    try {
      const result = await InventoryService.getLowStockProducts();
      return InventoryController.ok(res, result);
    } catch (error: any) {
      console.error('Error fetching low stock products:', error);
      return InventoryController.fail(res, error.message || 'Failed to fetch low stock products', 500);
    }
  }

  /**
   * Get out of stock products
   * GET /api/admin/shop/inventory/out-of-stock
   */
  static async getOutOfStockProducts(req: Request, res: Response) {
    try {
      const result = await InventoryService.getOutOfStockProducts();
      return InventoryController.ok(res, result);
    } catch (error: any) {
      console.error('Error fetching out of stock products:', error);
      return InventoryController.fail(res, error.message || 'Failed to fetch out of stock products', 500);
    }
  }

  /**
   * Get inventory value
   * GET /api/admin/shop/inventory/value
   */
  static async getInventoryValue(req: Request, res: Response) {
    try {
      const result = await InventoryService.getInventoryValue();
      const serializedResult = {
        totalValue: Number(result.totalValue) || 0,
        totalQuantity: Number(result.totalQuantity) || 0,
        productCount: Number(result.productCount) || 0,
      };
      return InventoryController.ok(res, serializedResult);
    } catch (error: any) {
      console.error('Error fetching inventory value:', error);
      return InventoryController.fail(res, error.message || 'Failed to fetch inventory value', 500);
    }
  }

  /**
   * Get inventory statistics
   * GET /api/admin/shop/inventory/stats
   */
  static async getInventoryStats(req: Request, res: Response) {
    try {
      const stats = await InventoryService.getInventoryStats();
      // Ensure all numbers are serialized correctly
      const serializedStats = {
        ...stats,
        inventoryValue: Number(stats.inventoryValue) || 0,
        totalQuantity: Number(stats.totalQuantity) || 0,
      };
      return InventoryController.ok(res, serializedStats);
    } catch (error: any) {
      console.error('Error fetching inventory stats:', error);
      return InventoryController.fail(res, error.message || 'Failed to fetch inventory stats', 500);
    }
  }

  /**
   * Bulk stock adjustment
   * POST /api/admin/shop/inventory/bulk-adjust
   */
  static async bulkAdjustStock(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { adjustments } = req.body;

      if (!Array.isArray(adjustments) || adjustments.length === 0) {
        return InventoryController.fail(res, 'adjustments array is required', 400);
      }

      const result = await InventoryService.bulkAdjustStock(adjustments, userId);
      return InventoryController.ok(res, result, `${result.adjusted} stock adjustments completed`);
    } catch (error: any) {
      console.error('Error bulk adjusting stock:', error);
      return InventoryController.fail(res, error.message || 'Failed to bulk adjust stock', 500);
    }
  }

  /**
   * Check low stock and send email notifications
   * POST /api/admin/shop/inventory/check-low-stock
   */
  static async checkLowStock(req: Request, res: Response) {
    try {
      const result = await InventoryService.checkAndNotifyLowStock();
      
      if (result.sent) {
        return InventoryController.ok(
          res,
          result,
          `Low stock alert sent for ${result.count} products to ${result.email}`
        );
      } else {
        return InventoryController.ok(
          res,
          result,
          result.reason || 'No low stock products found'
        );
      }
    } catch (error: any) {
      console.error('Error checking low stock:', error);
      return InventoryController.fail(res, error.message || 'Failed to check low stock', 500);
    }
  }
}
