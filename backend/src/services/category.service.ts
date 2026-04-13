import prisma from '../config/db';
import { Prisma } from '@prisma/client';

interface CreateCategoryDto {
  name: string;
  description?: string;
  parentId?: string;
  imageUrl?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
}

interface UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string;
  imageUrl?: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
}

interface CategoryFilters {
  parentId?: string | null;
  isActive?: boolean;
  search?: string;
}

export class CategoryService {
  /**
   * Create a new product category
   */
  static async createCategory(data: CreateCategoryDto) {
    // Generate slug from name
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if slug already exists
    const existingCategory = await prisma.productCategory.findUnique({
      where: { slug },
    });

    if (existingCategory) {
      throw new Error(`Category with name "${data.name}" already exists`);
    }

    // If parentId is provided, verify it exists
    if (data.parentId) {
      const parentCategory = await prisma.productCategory.findUnique({
        where: { id: data.parentId },
      });

      if (!parentCategory) {
        throw new Error('Parent category not found');
      }
    }

    const category = await prisma.productCategory.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        parentId: data.parentId,
        imageUrl: data.imageUrl,
        icon: data.icon,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
      },
      include: {
        parent: true,
        children: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    return category;
  }

  /**
   * Get all categories with optional filters
   */
  static async listCategories(filters: CategoryFilters = {}) {
    const where: Prisma.ProductCategoryWhereInput = {};

    if (filters.parentId !== undefined) {
      where.parentId = filters.parentId;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const categories = await prisma.productCategory.findMany({
      where,
      include: {
        parent: true,
        children: {
          orderBy: { displayOrder: 'asc' },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    return categories;
  }

  /**
   * Get category tree (hierarchical structure)
   */
  static async getCategoryTree() {
    // Get all root categories (no parent)
    const rootCategories = await prisma.productCategory.findMany({
      where: { parentId: null, isActive: true },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            children: {
              where: { isActive: true },
              orderBy: { displayOrder: 'asc' },
            },
            _count: {
              select: { products: true },
            },
          },
        },
        _count: {
          select: { products: true },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    return rootCategories;
  }

  /**
   * Get a single category by ID
   */
  static async getCategoryById(id: string) {
    const category = await prisma.productCategory.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          orderBy: { displayOrder: 'asc' },
        },
        products: {
          where: { isActive: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    return category;
  }

  /**
   * Get a category by slug
   */
  static async getCategoryBySlug(slug: string) {
    const category = await prisma.productCategory.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    return category;
  }

  /**
   * Update a category
   */
  static async updateCategory(id: string, data: UpdateCategoryDto) {
    // Verify category exists
    const existingCategory = await prisma.productCategory.findUnique({
      where: { id },
    });

    if (!existingCategory) {
      throw new Error('Category not found');
    }

    // If name is being updated, regenerate slug
    let slug: string | undefined;
    if (data.name && data.name !== existingCategory.name) {
      slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Check if new slug conflicts
      const slugConflict = await prisma.productCategory.findFirst({
        where: {
          slug,
          NOT: { id },
        },
      });

      if (slugConflict) {
        throw new Error(`Category with name "${data.name}" already exists`);
      }
    }

    // If parentId is being updated, verify it exists and prevent circular reference
    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === id) {
        throw new Error('Category cannot be its own parent');
      }

      const parentCategory = await prisma.productCategory.findUnique({
        where: { id: data.parentId },
      });

      if (!parentCategory) {
        throw new Error('Parent category not found');
      }

      // Check if the new parent is a descendant of this category
      const isDescendant = await this.isDescendantOf(data.parentId, id);
      if (isDescendant) {
        throw new Error('Cannot set a descendant category as parent (would create circular reference)');
      }
    }

    const updatedCategory = await prisma.productCategory.update({
      where: { id },
      data: {
        name: data.name,
        slug,
        description: data.description,
        parentId: data.parentId,
        imageUrl: data.imageUrl,
        icon: data.icon,
        displayOrder: data.displayOrder,
        isActive: data.isActive,
      },
      include: {
        parent: true,
        children: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    return updatedCategory;
  }

  /**
   * Delete a category (soft delete by setting isActive to false)
   */
  static async deleteCategory(id: string) {
    const category = await prisma.productCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    if (category._count.products > 0) {
      throw new Error(`Cannot delete category with ${category._count.products} products. Move or delete products first.`);
    }

    if (category._count.children > 0) {
      throw new Error(`Cannot delete category with ${category._count.children} subcategories. Move or delete subcategories first.`);
    }

    await prisma.productCategory.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Category deleted successfully' };
  }

  /**
   * Permanently delete a category
   */
  static async permanentlyDeleteCategory(id: string) {
    const category = await prisma.productCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    if (category._count.products > 0) {
      throw new Error(`Cannot delete category with ${category._count.products} products`);
    }

    if (category._count.children > 0) {
      throw new Error(`Cannot delete category with ${category._count.children} subcategories`);
    }

    await prisma.productCategory.delete({
      where: { id },
    });

    return { message: 'Category permanently deleted' };
  }

  /**
   * Reorder categories
   */
  static async reorderCategories(categoryOrders: { id: string; displayOrder: number }[]) {
    await prisma.$transaction(
      categoryOrders.map(({ id, displayOrder }) =>
        prisma.productCategory.update({
          where: { id },
          data: { displayOrder },
        })
      )
    );

    return { message: 'Categories reordered successfully' };
  }

  /**
   * Helper method to check if categoryId is a descendant of potentialAncestorId
   */
  private static async isDescendantOf(categoryId: string, potentialAncestorId: string): Promise<boolean> {
    const category = await prisma.productCategory.findUnique({
      where: { id: categoryId },
      select: { parentId: true },
    });

    if (!category || !category.parentId) {
      return false;
    }

    if (category.parentId === potentialAncestorId) {
      return true;
    }

    return this.isDescendantOf(category.parentId, potentialAncestorId);
  }
}
