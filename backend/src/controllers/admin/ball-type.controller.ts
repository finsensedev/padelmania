import { Request, Response } from "express";
import prisma from "../../config/db";

export class BallTypeController {
  /**
   * Get all ball types
   * GET /admin/ball-types
   */
  static async getAllBallTypes(req: Request, res: Response) {
    try {
      const ballTypes = await prisma.equipment.findMany({
        where: {
          type: "BALLS",
        },
        orderBy: [
          { isActive: "desc" },
          { rentalPrice: "asc" },
          { createdAt: "asc" },
        ],
        select: {
          id: true,
          name: true,
          brand: true,
          rentalPrice: true,
          totalQuantity: true,
          availableQty: true,
          condition: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.json({
        success: true,
        data: ballTypes,
      });
    } catch (error) {
      console.error("Error fetching ball types:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch ball types",
      });
    }
  }

  /**
   * Get active ball types (for customer selection)
   * GET /ball-types
   */
  static async getActiveBallTypes(req: Request, res: Response) {
    try {
      const ballTypes = await prisma.equipment.findMany({
        where: {
          type: "BALLS",
          isActive: true,
        },
        orderBy: [{ rentalPrice: "asc" }],
        select: {
          id: true,
          name: true,
          brand: true,
          rentalPrice: true,
          availableQty: true,
        },
      });

      return res.json({
        success: true,
        data: ballTypes,
      });
    } catch (error) {
      console.error("Error fetching active ball types:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch active ball types",
      });
    }
  }

  /**
   * Get single ball type by ID
   * GET /admin/ball-types/:id
   */
  static async getBallTypeById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const ballType = await prisma.equipment.findFirst({
        where: {
          id,
          type: "BALLS",
        },
      });

      if (!ballType) {
        return res.status(404).json({
          success: false,
          message: "Ball type not found",
        });
      }

      return res.json({
        success: true,
        data: ballType,
      });
    } catch (error) {
      console.error("Error fetching ball type:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch ball type",
      });
    }
  }

  /**
   * Create new ball type
   * POST /admin/ball-types
   */
  static async createBallType(req: Request, res: Response) {
    try {
      const {
        name,
        brand,
        rentalPrice,
        totalQuantity,
        availableQty,
        condition,
        isActive,
      } = req.body;

      // Validation
      if (!name || !rentalPrice || totalQuantity === undefined) {
        return res.status(400).json({
          success: false,
          message: "Name, rental price, and total quantity are required",
        });
      }

      if (rentalPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "Rental price must be greater than 0",
        });
      }

      if (totalQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: "Total quantity cannot be negative",
        });
      }

      const finalAvailableQty =
        availableQty !== undefined ? availableQty : totalQuantity;

      if (finalAvailableQty < 0 || finalAvailableQty > totalQuantity) {
        return res.status(400).json({
          success: false,
          message: "Available quantity must be between 0 and total quantity",
        });
      }

      // Check for duplicate name
      const existing = await prisma.equipment.findFirst({
        where: {
          type: "BALLS",
          name: {
            equals: name.trim(),
            mode: "insensitive",
          },
        },
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: "A ball type with this name already exists",
        });
      }

      const ballType = await prisma.equipment.create({
        data: {
          name: name.trim(),
          type: "BALLS",
          brand: brand?.trim() || "Generic",
          rentalPrice: Number(rentalPrice),
          totalQuantity: Number(totalQuantity),
          availableQty: Number(finalAvailableQty),
          condition: condition || "GOOD",
          isActive: isActive !== undefined ? Boolean(isActive) : true,
        },
      });

      return res.status(201).json({
        success: true,
        data: ballType,
        message: "Ball type created successfully",
      });
    } catch (error) {
      console.error("Error creating ball type:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create ball type",
      });
    }
  }

  /**
   * Update ball type
   * PUT /admin/ball-types/:id
   */
  static async updateBallType(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        brand,
        rentalPrice,
        totalQuantity,
        availableQty,
        condition,
        isActive,
      } = req.body;

      const existing = await prisma.equipment.findFirst({
        where: {
          id,
          type: "BALLS",
        },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Ball type not found",
        });
      }

      // Build update data object
      const updateData: any = {};

      if (name !== undefined) {
        const trimmedName = name.trim();
        if (!trimmedName) {
          return res.status(400).json({
            success: false,
            message: "Name cannot be empty",
          });
        }

        // Check for duplicate name (excluding current item)
        const duplicate = await prisma.equipment.findFirst({
          where: {
            type: "BALLS",
            name: {
              equals: trimmedName,
              mode: "insensitive",
            },
            id: {
              not: id,
            },
          },
        });

        if (duplicate) {
          return res.status(400).json({
            success: false,
            message: "A ball type with this name already exists",
          });
        }

        updateData.name = trimmedName;
      }

      if (brand !== undefined) {
        updateData.brand = brand.trim() || "Generic";
      }

      if (rentalPrice !== undefined) {
        if (rentalPrice <= 0) {
          return res.status(400).json({
            success: false,
            message: "Rental price must be greater than 0",
          });
        }
        updateData.rentalPrice = Number(rentalPrice);
      }

      if (totalQuantity !== undefined) {
        if (totalQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: "Total quantity cannot be negative",
          });
        }
        updateData.totalQuantity = Number(totalQuantity);
      }

      if (availableQty !== undefined) {
        const finalTotalQty =
          updateData.totalQuantity !== undefined
            ? updateData.totalQuantity
            : existing.totalQuantity;

        if (availableQty < 0 || availableQty > finalTotalQty) {
          return res.status(400).json({
            success: false,
            message: "Available quantity must be between 0 and total quantity",
          });
        }
        updateData.availableQty = Number(availableQty);
      }

      if (condition !== undefined) {
        updateData.condition = condition;
      }

      if (isActive !== undefined) {
        updateData.isActive = Boolean(isActive);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid fields to update",
        });
      }

      updateData.updatedAt = new Date();

      const ballType = await prisma.equipment.update({
        where: { id },
        data: updateData,
      });

      return res.json({
        success: true,
        data: ballType,
        message: "Ball type updated successfully",
      });
    } catch (error) {
      console.error("Error updating ball type:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update ball type",
      });
    }
  }

  /**
   * Delete ball type (soft delete by setting isActive to false)
   * DELETE /admin/ball-types/:id
   */
  static async deleteBallType(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const existing = await prisma.equipment.findFirst({
        where: {
          id,
          type: "BALLS",
        },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Ball type not found",
        });
      }

      // Soft delete by setting isActive to false
      await prisma.equipment.update({
        where: { id },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      return res.json({
        success: true,
        message: "Ball type deactivated successfully",
      });
    } catch (error) {
      console.error("Error deleting ball type:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete ball type",
      });
    }
  }

  /**
   * Update ball type stock (for inventory management)
   * PATCH /admin/ball-types/:id/stock
   */
  static async updateBallTypeStock(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { totalQuantity, availableQty } = req.body;

      const existing = await prisma.equipment.findFirst({
        where: {
          id,
          type: "BALLS",
        },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Ball type not found",
        });
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (totalQuantity !== undefined) {
        if (totalQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: "Total quantity cannot be negative",
          });
        }
        updateData.totalQuantity = Number(totalQuantity);
      }

      if (availableQty !== undefined) {
        const finalTotalQty =
          updateData.totalQuantity !== undefined
            ? updateData.totalQuantity
            : existing.totalQuantity;

        if (availableQty < 0 || availableQty > finalTotalQty) {
          return res.status(400).json({
            success: false,
            message: "Available quantity must be between 0 and total quantity",
          });
        }
        updateData.availableQty = Number(availableQty);
      }

      const ballType = await prisma.equipment.update({
        where: { id },
        data: updateData,
      });

      return res.json({
        success: true,
        data: ballType,
        message: "Stock updated successfully",
      });
    } catch (error) {
      console.error("Error updating stock:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update stock",
      });
    }
  }
}
