import { Router } from 'express';
import { CategoryController } from '../controllers/admin/category.controller';
import { ProductController } from '../controllers/admin/product.controller';
import { InventoryController } from '../controllers/admin/inventory.controller';
import { shopOrderController } from '../controllers/admin/shop-order.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { requireTwoFactor } from '../middleware/twofa.middleware';
import { upload } from '../utils/image-upload.util';

const router = Router();

// All routes require authentication and manager/admin authorization
const shopAuth = [authenticate, authorize('MANAGER', 'ADMIN', 'SUPER_ADMIN')];
// Customer routes only need authentication
const customerAuth = [authenticate];

// ============================================================================
// CATEGORY ROUTES
// ============================================================================

// Get category tree (hierarchical)
router.get('/categories/tree', shopAuth, CategoryController.getCategoryTree);

// Reorder categories
router.put('/categories/reorder', shopAuth, CategoryController.reorderCategories);

// CRUD operations
router.get('/categories', customerAuth, CategoryController.listCategories);
router.post('/categories', shopAuth, CategoryController.createCategory);
router.get('/categories/:id', customerAuth, CategoryController.getCategory);
router.patch('/categories/:id', shopAuth, CategoryController.updateCategory);
router.delete('/categories/:id', shopAuth, CategoryController.deleteCategory);
router.delete('/categories/:id/permanent', shopAuth, CategoryController.permanentlyDeleteCategory);

// ============================================================================
// PRODUCT ROUTES
// ============================================================================

// Special product routes (before :id param routes)
router.get('/products/low-stock', shopAuth, ProductController.getLowStockProducts);
router.get('/products/brands', shopAuth, ProductController.getBrands);
router.get('/products/tags', shopAuth, ProductController.getTags);

// Image upload route
router.post(
  '/products/images/upload',
  shopAuth,
  upload.array('images', 10),
  ProductController.uploadImages
);

// Image management
router.put('/products/images/reorder', shopAuth, ProductController.updateImageOrder);
router.put('/products/images/:imageId/primary', shopAuth, ProductController.setPrimaryImage);
router.delete('/products/images/:imageId', shopAuth, ProductController.removeImage);

// CRUD operations
router.get('/products', customerAuth, ProductController.listProducts);
router.post('/products', [...shopAuth, requireTwoFactor], upload.array('images', 10), ProductController.createProduct);
router.get('/products/:id', customerAuth, ProductController.getProduct);
router.patch('/products/:id', [...shopAuth, requireTwoFactor], ProductController.updateProduct);
router.delete('/products/:id', [...shopAuth, requireTwoFactor], ProductController.deleteProduct);

// Stock management
router.patch('/products/:id/stock', [...shopAuth, requireTwoFactor], ProductController.updateStock);

// Product images
router.post('/products/:id/images', [...shopAuth, requireTwoFactor], ProductController.addImages);

// ============================================================================
// INVENTORY ROUTES
// ============================================================================

// Statistics and reporting
router.get('/inventory/stats', shopAuth, InventoryController.getInventoryStats);
router.get('/inventory/value', shopAuth, InventoryController.getInventoryValue);
router.get('/inventory/low-stock', shopAuth, InventoryController.getLowStockProducts);
router.get('/inventory/out-of-stock', shopAuth, InventoryController.getOutOfStockProducts);

// Stock history
router.get('/inventory/history/:productId', shopAuth, InventoryController.getStockHistory);

// Inventory logs
router.get('/inventory/logs', shopAuth, InventoryController.getInventoryLogs);

// Stock adjustments
router.post('/inventory/adjust', shopAuth, InventoryController.adjustStock);
router.post('/inventory/bulk-adjust', shopAuth, InventoryController.bulkAdjustStock);

// Low stock alerts
router.post('/inventory/check-low-stock', shopAuth, InventoryController.checkLowStock);

// ============================================================================
// ORDER ROUTES (Customer accessible)
// ============================================================================

// Create order (purchase product)
router.post('/orders', customerAuth, shopOrderController.createOrder.bind(shopOrderController));

// Get customer orders
router.get('/orders', customerAuth, shopOrderController.getCustomerOrders.bind(shopOrderController));

// Get specific order
router.get('/orders/:id', customerAuth, shopOrderController.getOrder.bind(shopOrderController));

export default router;
