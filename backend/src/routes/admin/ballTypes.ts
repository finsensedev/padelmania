import { Router } from "express";
import { Request, Response } from "express";
import prisma from "../../config/db";
import { authenticate, authorize } from "../../middleware/auth.middleware";

const router = Router();

/**
 * @route   GET /admin/ball-types
 * @desc    Get all ball types (active and inactive)
 * @access  Admin only
 */
router.get(
  "/ball-types",
  authenticate,
  authorize("SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const ballTypes = await prisma.equipment.findMany({
        where: {
          type: "BALLS",
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      });

      res.json({
        success: true,
        message: "Ball types fetched successfully",
        data: ballTypes,
      });
    } catch (error) {
      console.error("Error fetching ball types:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch ball types",
      });
    }
  }
);

/**
 * @route   POST /admin/ball-types
 * @desc    Create a new ball type
 * @access  Admin only
 */
router.post(
  "/ball-types",
  authenticate,
  authorize("SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { name, brand, rentalPrice, condition, isActive } = req.body;

      // Validate required fields
      if (!name || !rentalPrice) {
        return res.status(400).json({
          success: false,
          message: "Name and rental price are required",
        });
      }

      // Check if ball type with same name already exists
      const existingBallType = await prisma.equipment.findFirst({
        where: {
          name,
          type: "BALLS",
        },
      });

      if (existingBallType) {
        return res.status(409).json({
          success: false,
          message: "A ball type with this name already exists",
        });
      }

      const ballType = await prisma.equipment.create({
        data: {
          type: "BALLS",
          name,
          brand: brand || "",
          rentalPrice: parseFloat(rentalPrice),
          totalQuantity: 100, // Default value for database consistency
          availableQty: 100, // Default value for database consistency
          condition: condition || "GOOD",
          isActive: isActive ?? true,
        },
      });

      res.status(201).json({
        success: true,
        message: "Ball type created successfully",
        data: ballType,
      });
    } catch (error) {
      console.error("Error creating ball type:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create ball type",
      });
    }
  }
);

/**
 * @route   PUT /admin/ball-types/:id
 * @desc    Update a ball type
 * @access  Admin only
 */
router.put(
  "/ball-types/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, brand, rentalPrice, condition, isActive } = req.body;

      // Check if ball type exists
      const existingBallType = await prisma.equipment.findFirst({
        where: {
          id,
          type: "BALLS",
        },
      });

      if (!existingBallType) {
        return res.status(404).json({
          success: false,
          message: "Ball type not found",
        });
      }

      // Check if name is being changed to one that already exists
      if (name && name !== existingBallType.name) {
        const duplicateName = await prisma.equipment.findFirst({
          where: {
            name,
            type: "BALLS",
            id: { not: id },
          },
        });

        if (duplicateName) {
          return res.status(409).json({
            success: false,
            message: "A ball type with this name already exists",
          });
        }
      }

      const ballType = await prisma.equipment.update({
        where: { id },
        data: {
          name,
          brand,
          rentalPrice: rentalPrice ? parseFloat(rentalPrice) : undefined,
          condition,
          isActive,
        },
      });

      res.json({
        success: true,
        message: "Ball type updated successfully",
        data: ballType,
      });
    } catch (error) {
      console.error("Error updating ball type:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update ball type",
      });
    }
  }
);

/**
 * @route   PATCH /admin/ball-types/:id/stock
 * @desc    Update ball type stock levels
 * @access  Admin only
 */
router.patch(
  "/ball-types/:id/stock",
  authenticate,
  authorize("SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { totalQuantity, availableQty } = req.body;

      const ballType = await prisma.equipment.update({
        where: { id },
        data: {
          totalQuantity: totalQuantity ? parseInt(totalQuantity) : undefined,
          availableQty: availableQty ? parseInt(availableQty) : undefined,
        },
      });

      res.json({
        success: true,
        message: "Stock updated successfully",
        data: ballType,
      });
    } catch (error) {
      console.error("Error updating stock:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update stock",
      });
    }
  }
);

/**
 * @route   DELETE /admin/ball-types/:id
 * @desc    Soft delete a ball type (mark as inactive)
 * @access  Admin only
 */
router.delete(
  "/ball-types/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Check if ball type exists
      const existingBallType = await prisma.equipment.findFirst({
        where: {
          id,
          type: "BALLS",
        },
      });

      if (!existingBallType) {
        return res.status(404).json({
          success: false,
          message: "Ball type not found",
        });
      }

      // Soft delete by marking as inactive
      const ballType = await prisma.equipment.update({
        where: { id },
        data: {
          isActive: false,
        },
      });

      res.json({
        success: true,
        message: "Ball type deactivated successfully",
        data: ballType,
      });
    } catch (error) {
      console.error("Error deleting ball type:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete ball type",
      });
    }
  }
);

export default router;
