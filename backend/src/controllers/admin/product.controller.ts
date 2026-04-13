import { Request, Response } from 'express';
import { ProductService } from '../../services/product.service';
import { uploadMultipleToCloudinary, deleteFromCloudinary } from '../../utils/image-upload.util';

export class ProductController {
  /**
   * Serialize product data - convert Prisma Decimal to number
   */
  private static serializeProduct(product: any, isStaff: boolean = true): any {
    if (!product) return product;
    
    const serialize = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(item => serialize(item));
      }
      
      if (typeof obj === 'object' && obj.constructor === Object) {
        const serialized: any = {};
        for (const key in obj) {
          // Skip sensitive fields if not staff
          if (!isStaff && (key === 'costPrice' || key === 'supplier' || key === 'supplierId')) {
            continue;
          }

          const value = obj[key];
          
          // Handle Prisma Decimal / objects with toNumber
          if (value && typeof value === 'object' && typeof value.toNumber === 'function') {
            serialized[key] = value.toNumber();
          } 
          // Handle string numbers for price fields (just in case)
          else if ((key === 'basePrice' || key === 'salePrice' || key === 'costPrice' || key === 'price') && typeof value === 'string') {
            serialized[key] = parseFloat(value) || 0;
          }
          else {
            serialized[key] = serialize(value);
          }
        }
        return serialized;
      }
      
      return obj;
    };
    
    return serialize(product);
  }

  /**
   * Success response helper
   */
  private static ok(res: Response, data: unknown, message = 'OK', isStaff: boolean = true) {
    const serializedData = ProductController.serializeProduct(data, isStaff);
    // Note: Cache headers are set globally in app.ts middleware
    return res.json({ success: true, message, data: serializedData });
  }

  /**
   * Error response helper
   */
  private static fail(res: Response, message = 'Bad Request', code = 400) {
    return res.status(code).json({ success: false, message });
  }

  /**
   * Create a new product
   * POST /api/admin/shop/products
   */
  static async createProduct(req: Request, res: Response) {
    try {
      console.log('Creating product - Body:', JSON.stringify(req.body, null, 2));
      console.log('Creating product - Files:', req.files ? (req.files as any[]).length : 0);

      const userId = (req as any).user?.id;
      const files = req.files as Express.Multer.File[];
      
      // Upload images to Cloudinary if files are provided
      let imageUrls: string[] = [];
      if (files && files.length > 0) {
        try {
          imageUrls = await uploadMultipleToCloudinary(files, 'products');
          console.log('Uploaded images to Cloudinary:', imageUrls);
        } catch (uploadError) {
          console.error('Failed to upload images to Cloudinary:', uploadError);
        }
      } else {
        console.log('No files provided for upload');
      }
      
      // Parse specifications and variants if they're JSON strings
      let specifications = req.body.specifications;
      if (typeof specifications === 'string') {
        try {
          specifications = JSON.parse(specifications);
        } catch (e) {
          specifications = {};
        }
      }
      
      let variants = req.body.variants;
      if (typeof variants === 'string') {
        try {
          variants = JSON.parse(variants);
        } catch (e) {
          variants = [];
        }
      }
      
      // Convert string values to proper types - round prices to integers for M-Pesa compatibility
      const productData = {
        ...req.body,
        // Handle SKU: if empty string, set to undefined to avoid unique constraint violation
        sku: req.body.sku && req.body.sku.trim() !== '' ? req.body.sku : undefined,
        basePrice: Math.round(parseFloat(req.body.basePrice) || 0),
        salePrice: req.body.salePrice ? Math.round(parseFloat(req.body.salePrice)) : undefined,
        costPrice: req.body.costPrice ? Math.round(parseFloat(req.body.costPrice)) : undefined,
        stockQuantity: req.body.stockQuantity ? parseInt(req.body.stockQuantity) : 0,
        lowStockThreshold: req.body.lowStockThreshold ? parseInt(req.body.lowStockThreshold) : 5,
        weight: req.body.weight ? parseFloat(req.body.weight) : undefined,
        displayOrder: req.body.displayOrder ? parseInt(req.body.displayOrder) : 0,
        featured: req.body.featured === true || req.body.featured === 'true',
        newArrival: req.body.newArrival === true || req.body.newArrival === 'true',
        bestSeller: req.body.bestSeller === true || req.body.bestSeller === 'true',
        isActive: req.body.isActive === true || req.body.isActive === 'true',
        specifications,
        variants: variants || [],
        images: imageUrls.map((url, index) => ({
          imageUrl: url,
          altText: req.body.name,
          displayOrder: index,
          isPrimary: index === 0, // First image is primary
        })),
      };
      
      console.log('Product data to save:', JSON.stringify(productData, null, 2));

      const product = await ProductService.createProduct(productData, userId);
      return ProductController.ok(res, product, 'Product created successfully');
    } catch (error: any) {
      console.error('Error creating product:', error);
      return ProductController.fail(res, error.message || 'Failed to create product', 500);
    }
  }

  /**
   * Upload product images
   * POST /api/admin/shop/products/images/upload
   */
  static async uploadImages(req: Request, res: Response) {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return ProductController.fail(res, 'No images provided', 400);
      }

      const imageUrls = await uploadMultipleToCloudinary(files, 'products');
      
      return ProductController.ok(res, { imageUrls }, 'Images uploaded successfully');
    } catch (error: any) {
      console.error('Error uploading images:', error);
      return ProductController.fail(res, error.message || 'Failed to upload images', 500);
    }
  }

  /**
   * List products with filters and pagination
   * GET /api/admin/shop/products
   */
  static async listProducts(req: Request, res: Response) {
    try {
      const userRole = (req as any).user?.role;
      const isStaff = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);

      const {
        categoryId,
        brand,
        minPrice,
        maxPrice,
        featured,
        newArrival,
        bestSeller,
        isActive,
        inStock,
        search,
        tags,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query;

      const filters: any = {};

      if (categoryId) filters.categoryId = String(categoryId);
      if (brand) filters.brand = String(brand);
      if (minPrice) filters.minPrice = parseFloat(String(minPrice));
      if (maxPrice) filters.maxPrice = parseFloat(String(maxPrice));
      if (featured !== undefined) filters.featured = featured === 'true';
      if (newArrival !== undefined) filters.newArrival = newArrival === 'true';
      if (bestSeller !== undefined) filters.bestSeller = bestSeller === 'true';
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      if (inStock !== undefined) filters.inStock = inStock === 'true';
      if (search) filters.search = String(search);
      if (tags) {
        filters.tags = Array.isArray(tags) ? tags : [tags];
      }
      if (page) filters.page = parseInt(String(page));
      if (limit) filters.limit = parseInt(String(limit));
      if (sortBy) filters.sortBy = String(sortBy);
      if (sortOrder) filters.sortOrder = String(sortOrder);

      // Force active products for non-staff
      if (!isStaff) {
        filters.isActive = true;
      }

      const result = await ProductService.listProducts(filters);
      return ProductController.ok(res, result, 'OK', isStaff);
    } catch (error: any) {
      console.error('Error listing products:', error);
      return ProductController.fail(res, error.message || 'Failed to fetch products', 500);
    }
  }

  /**
   * Get a single product by ID
   * GET /api/admin/shop/products/:id
   */
  static async getProduct(req: Request, res: Response) {
    try {
      const userRole = (req as any).user?.role;
      const isStaff = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);
      const { id } = req.params;
      const product = await ProductService.getProductById(id);
      
      // Check if product is active for non-staff
      if (!isStaff && !product.isActive) {
        return ProductController.fail(res, 'Product not found', 404);
      }

      return ProductController.ok(res, product, 'OK', isStaff);
    } catch (error: any) {
      console.error('Error fetching product:', error);
      const statusCode = error.message === 'Product not found' ? 404 : 500;
      return ProductController.fail(res, error.message || 'Failed to fetch product', statusCode);
    }
  }

  /**
   * Update a product
   * PATCH /api/admin/shop/products/:id
   */
  static async updateProduct(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      console.log('Updating product ID:', id);
      console.log('Update payload received:', JSON.stringify(req.body, null, 2));
      
      // Convert string values to proper types - round prices to integers for M-Pesa compatibility
      const updateData: any = { ...req.body };
      
      // Handle SKU: if empty string or whitespace, set to null to avoid unique constraint issues
      if (updateData.sku !== undefined) {
        updateData.sku = updateData.sku && updateData.sku.trim() !== '' ? updateData.sku.trim() : null;
      }
      
      if (updateData.basePrice !== undefined) {
        updateData.basePrice = Math.round(parseFloat(updateData.basePrice));
      }
      if (updateData.salePrice !== undefined && updateData.salePrice !== null && updateData.salePrice !== '') {
        updateData.salePrice = Math.round(parseFloat(updateData.salePrice));
      }
      if (updateData.costPrice !== undefined && updateData.costPrice !== null && updateData.costPrice !== '') {
        updateData.costPrice = Math.round(parseFloat(updateData.costPrice));
      }
      if (updateData.stockQuantity !== undefined) {
        updateData.stockQuantity = parseInt(updateData.stockQuantity);
      }
      if (updateData.lowStockThreshold !== undefined) {
        updateData.lowStockThreshold = parseInt(updateData.lowStockThreshold);
      }
      if (updateData.weight !== undefined && updateData.weight !== null && updateData.weight !== '') {
        updateData.weight = parseFloat(updateData.weight);
      }
      if (updateData.displayOrder !== undefined) {
        updateData.displayOrder = parseInt(updateData.displayOrder);
      }
      if (updateData.featured !== undefined) {
        updateData.featured = updateData.featured === true || updateData.featured === 'true';
      }
      if (updateData.newArrival !== undefined) {
        updateData.newArrival = updateData.newArrival === true || updateData.newArrival === 'true';
      }
      if (updateData.bestSeller !== undefined) {
        updateData.bestSeller = updateData.bestSeller === true || updateData.bestSeller === 'true';
      }
      if (updateData.isActive !== undefined) {
        updateData.isActive = updateData.isActive === true || updateData.isActive === 'true';
      }
      
      const product = await ProductService.updateProduct(id, updateData);
      return ProductController.ok(res, product, 'Product updated successfully');
    } catch (error: any) {
      console.error('Error updating product:', error);
      const statusCode = error.message === 'Product not found' ? 404 : 500;
      return ProductController.fail(res, error.message || 'Failed to update product', statusCode);
    }
  }

  /**
   * Update product stock
   * PATCH /api/admin/shop/products/:id/stock
   */
  static async updateStock(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { quantityChange, reason } = req.body;
      const userId = (req as any).user?.id;

      // Convert quantityChange to number if it's a string
      const parsedQuantityChange = typeof quantityChange === 'string' 
        ? parseInt(quantityChange) 
        : quantityChange;

      if (typeof parsedQuantityChange !== 'number' || isNaN(parsedQuantityChange)) {
        return ProductController.fail(res, 'quantityChange must be a valid number', 400);
      }

      if (!reason) {
        return ProductController.fail(res, 'reason is required', 400);
      }

      const log = await ProductService.updateStock(id, parsedQuantityChange, reason, userId);
      return ProductController.ok(res, log, 'Stock updated successfully');
    } catch (error: any) {
      console.error('Error updating stock:', error);
      return ProductController.fail(res, error.message || 'Failed to update stock', 500);
    }
  }

  /**
   * Delete a product
   * DELETE /api/admin/shop/products/:id
   */
  static async deleteProduct(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await ProductService.deleteProduct(id);
      return ProductController.ok(res, result, result.message);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      const statusCode = error.message === 'Product not found' ? 404 : 400;
      return ProductController.fail(res, error.message || 'Failed to delete product', statusCode);
    }
  }

  /**
   * Add images to a product
   * POST /api/admin/shop/products/:id/images
   */
  static async addImages(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { images } = req.body;

      if (!Array.isArray(images) || images.length === 0) {
        return ProductController.fail(res, 'images array is required', 400);
      }

      const result = await ProductService.addImages(id, images);
      return ProductController.ok(res, result, 'Images added successfully');
    } catch (error: any) {
      console.error('Error adding images:', error);
      return ProductController.fail(res, error.message || 'Failed to add images', 500);
    }
  }

  /**
   * Remove an image from a product
   * DELETE /api/admin/shop/products/images/:imageId
   */
  static async removeImage(req: Request, res: Response) {
    try {
      const { imageId } = req.params;
      const { deleteFromCloud } = req.query;

      // If requested, delete from Cloudinary too
      if (deleteFromCloud === 'true') {
        // Get image details first
        const image = await ProductService.getProductById(req.params.id);
        // Extract imageUrl and delete from Cloudinary
        // Note: This is simplified, you'd need to fetch the specific image
      }

      const result = await ProductService.removeImage(imageId);
      return ProductController.ok(res, result, result.message);
    } catch (error: any) {
      console.error('Error removing image:', error);
      return ProductController.fail(res, error.message || 'Failed to remove image', 500);
    }
  }

  /**
   * Update image display order
   * PUT /api/admin/shop/products/images/reorder
   */
  static async updateImageOrder(req: Request, res: Response) {
    try {
      const { imageOrders } = req.body;

      if (!Array.isArray(imageOrders)) {
        return ProductController.fail(res, 'imageOrders must be an array', 400);
      }

      const result = await ProductService.updateImageOrder(imageOrders);
      return ProductController.ok(res, result, result.message);
    } catch (error: any) {
      console.error('Error updating image order:', error);
      return ProductController.fail(res, error.message || 'Failed to update image order', 500);
    }
  }

  /**
   * Set primary image
   * PUT /api/admin/shop/products/images/:imageId/primary
   */
  static async setPrimaryImage(req: Request, res: Response) {
    try {
      const { imageId } = req.params;
      const result = await ProductService.setPrimaryImage(imageId);
      return ProductController.ok(res, result, result.message);
    } catch (error: any) {
      console.error('Error setting primary image:', error);
      return ProductController.fail(res, error.message || 'Failed to set primary image', 500);
    }
  }

  /**
   * Get low stock products
   * GET /api/admin/shop/products/low-stock
   */
  static async getLowStockProducts(req: Request, res: Response) {
    try {
      const products = await ProductService.getLowStockProducts();
      return ProductController.ok(res, products);
    } catch (error: any) {
      console.error('Error fetching low stock products:', error);
      return ProductController.fail(res, error.message || 'Failed to fetch low stock products', 500);
    }
  }

  /**
   * Get all brands
   * GET /api/admin/shop/products/brands
   */
  static async getBrands(req: Request, res: Response) {
    try {
      const brands = await ProductService.getBrands();
      return ProductController.ok(res, brands);
    } catch (error: any) {
      console.error('Error fetching brands:', error);
      return ProductController.fail(res, error.message || 'Failed to fetch brands', 500);
    }
  }

  /**
   * Get all tags
   * GET /api/admin/shop/products/tags
   */
  static async getTags(req: Request, res: Response) {
    try {
      const tags = await ProductService.getTags();
      return ProductController.ok(res, tags);
    } catch (error: any) {
      console.error('Error fetching tags:', error);
      return ProductController.fail(res, error.message || 'Failed to fetch tags', 500);
    }
  }
}
