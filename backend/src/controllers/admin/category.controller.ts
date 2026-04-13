import { Request, Response } from 'express';
import { CategoryService } from '../../services/category.service';

export class CategoryController {
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
   * Create a new category
   * POST /api/admin/shop/categories
   */
  static async createCategory(req: Request, res: Response) {
    try {
      const category = await CategoryService.createCategory(req.body);
      return CategoryController.ok(res, category, 'Category created successfully');
    } catch (error: any) {
      console.error('Error creating category:', error);
      return CategoryController.fail(res, error.message || 'Failed to create category', 500);
    }
  }

  /**
   * List all categories with optional filters
   * GET /api/admin/shop/categories
   */
  static async listCategories(req: Request, res: Response) {
    try {
      const userRole = (req as any).user?.role;
      const isStaff = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);

      const { parentId, isActive, search } = req.query;

      const filters: any = {};
      
      if (parentId !== undefined) {
        filters.parentId = parentId === 'null' ? null : String(parentId);
      }
      
      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }
      
      if (search) {
        filters.search = String(search);
      }

      // Force active categories for non-staff
      if (!isStaff) {
        filters.isActive = true;
      }

      const categories = await CategoryService.listCategories(filters);
      return CategoryController.ok(res, categories);
    } catch (error: any) {
      console.error('Error listing categories:', error);
      return CategoryController.fail(res, error.message || 'Failed to fetch categories', 500);
    }
  }

  /**
   * Get category tree (hierarchical structure)
   * GET /api/admin/shop/categories/tree
   */
  static async getCategoryTree(req: Request, res: Response) {
    try {
      const tree = await CategoryService.getCategoryTree();
      return CategoryController.ok(res, tree);
    } catch (error: any) {
      console.error('Error fetching category tree:', error);
      return CategoryController.fail(res, error.message || 'Failed to fetch category tree', 500);
    }
  }

  /**
   * Get a single category by ID
   * GET /api/admin/shop/categories/:id
   */
  static async getCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const category = await CategoryService.getCategoryById(id);
      return CategoryController.ok(res, category);
    } catch (error: any) {
      console.error('Error fetching category:', error);
      const statusCode = error.message === 'Category not found' ? 404 : 500;
      return CategoryController.fail(res, error.message || 'Failed to fetch category', statusCode);
    }
  }

  /**
   * Update a category
   * PATCH /api/admin/shop/categories/:id
   */
  static async updateCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const category = await CategoryService.updateCategory(id, req.body);
      return CategoryController.ok(res, category, 'Category updated successfully');
    } catch (error: any) {
      console.error('Error updating category:', error);
      const statusCode = error.message === 'Category not found' ? 404 : 500;
      return CategoryController.fail(res, error.message || 'Failed to update category', statusCode);
    }
  }

  /**
   * Delete a category (soft delete)
   * DELETE /api/admin/shop/categories/:id
   */
  static async deleteCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await CategoryService.deleteCategory(id);
      return CategoryController.ok(res, result, result.message);
    } catch (error: any) {
      console.error('Error deleting category:', error);
      const statusCode = error.message === 'Category not found' ? 404 : 400;
      return CategoryController.fail(res, error.message || 'Failed to delete category', statusCode);
    }
  }

  /**
   * Permanently delete a category
   * DELETE /api/admin/shop/categories/:id/permanent
   */
  static async permanentlyDeleteCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await CategoryService.permanentlyDeleteCategory(id);
      return CategoryController.ok(res, result, result.message);
    } catch (error: any) {
      console.error('Error permanently deleting category:', error);
      const statusCode = error.message === 'Category not found' ? 404 : 400;
      return CategoryController.fail(res, error.message || 'Failed to permanently delete category', statusCode);
    }
  }

  /**
   * Reorder categories
   * PUT /api/admin/shop/categories/reorder
   */
  static async reorderCategories(req: Request, res: Response) {
    try {
      const { categoryOrders } = req.body;
      
      if (!Array.isArray(categoryOrders)) {
        return CategoryController.fail(res, 'categoryOrders must be an array', 400);
      }

      const result = await CategoryService.reorderCategories(categoryOrders);
      return CategoryController.ok(res, result, result.message);
    } catch (error: any) {
      console.error('Error reordering categories:', error);
      return CategoryController.fail(res, error.message || 'Failed to reorder categories', 500);
    }
  }
}
